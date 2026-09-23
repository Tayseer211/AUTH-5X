import {
  HYBRID_RULES,
  POLICY_VERSION,
  RULE_FAMILIES,
  aggregate,
  contradictionFamily,
  isUncorroboratedSensitiveMention,
  messageFamily,
  modelAgreement,
  rulesExcludingLanguage,
  transactionFamily,
} from './aggregation.js'
import { ENGINE_INFO, RISK_LEVELS, analyseStandingOrder } from './engine.js'
import { extractFeatures } from './features.js'
import { inputsAsOf, transactionModelEstimate } from './ml/explain.js'
import {
  ENGINE_LANGUAGE_CHECK,
  MODEL_FEATURE_DESCRIPTIONS,
  TRANSACTION_PROFILE_FLAGS,
  behaviourAnomalies,
  evidenceSignalFamily,
  modelFeatureGroup,
  transactionProfileFlags,
} from './signalFamilies.js'
import { CLASSIFIER_VERSION, classifyMessage } from './text/classifier.js'
import { compareTextEvidence } from './text/evidence.js'

// Assessment: the integration boundary for a pending standing order. It puts
// the separate analyses side by side and combines them with the explicit,
// deterministic hybrid policy in aggregation.js.
//
//   transactionAnalysis — the original rule engine (engine.js), unchanged:
//                         its 0–100 score and level are preserved, displayed,
//                         and used as the compatibility floor;
//   mlAnalysis          — the fraud model's transaction-only estimate
//                         (ml/explain.js), a synthetic-trained model estimate
//                         in a LOW / ELEVATED / HIGH band, never a probability
//                         of fraud; null when no model is supplied;
//   textAnalysis        — the message classifier (text/classifier.js);
//   evidenceAnalysis    — the message compared with the request and profile
//                         (text/evidence.js);
//   risk                — the three concern families (transaction, message,
//                         contradiction) and behaviour, as summarised for the
//                         policy;
//   combinedAssessment  — the final LOW / MEDIUM / HIGH level with the rules
//                         that set it, `drivers` (each deciding rule with the
//                         reasons behind it, every one taken from a source
//                         analysis), reasons, mitigating and supporting
//                         information, and verification steps.
//
// Each analysis is returned exactly as its component produced it. There is no
// combined fraud probability.
//
// Time: the analysis snapshot is `asOf`, the engine analysis's own timestamp.
// The model reads the ledger as it stood at `asOf`, so the same analysis always
// gives the same result; nothing here reads the clock.
//
// Without text, the text and evidence analyses are null. Without a model (or
// ledger history), the model estimate is absent or unavailable and the rest of
// the assessment is unaffected.

// 2.1.0 (Stage 6): policy hybrid-2, profile checks, drivers, model factors.
export const ASSESSMENT_VERSION = 'assessment-2.1.0'

// The policy's rules, for display and tests.
export const ASSESSMENT_RULES = HYBRID_RULES

// --- Reasons ----------------------------------------------------------------

function transactionReasons(analysis) {
  const reasons = []
  const mitigating = []
  for (const check of analysis.checks) {
    for (const finding of check.findings) {
      const entry = { source: 'transaction', check: check.id, tone: finding.tone, text: finding.text }
      if (finding.tone === 'ok') mitigating.push(entry)
      else reasons.push(entry)
    }
  }
  return { reasons, mitigating }
}

function textReasons(textAnalysis) {
  const reasons = []
  const mitigating = []
  for (const signal of textAnalysis?.signals ?? []) {
    const evidence = signal.evidence.length ? ` (${signal.evidence.slice(0, 3).map((item) => `“${item}”`).join(', ')})` : ''
    const text = `Message signal: ${signal.label}${evidence}.`
    if (signal.weight < 0) mitigating.push({ source: 'text', signal: signal.id, tone: 'ok', text })
    // Signals that weigh 3 or more on their own are the strong ones.
    else reasons.push({ source: 'text', signal: signal.id, tone: signal.weight >= 3 ? 'bad' : 'warn', text })
  }
  return { reasons, mitigating }
}

function evidenceReasons(evidenceAnalysis, textAnalysis) {
  const reasons = []
  const mitigating = []
  for (const signal of evidenceAnalysis?.signals ?? []) {
    const entry = { source: 'evidence', signal: signal.id, category: signal.category, tone: signal.tone, text: signal.text }
    if (isUncorroboratedSensitiveMention(signal, textAnalysis)) {
      reasons.push({ ...entry, tone: 'warn', text: `${signal.text} The message classifier reads this as a mention, not a request for them.` })
    } else if (signal.category === 'MATCH') mitigating.push(entry)
    else if ((signal.category === 'CONFLICT' || signal.category === 'SUSPICIOUS') && signal.tone) reasons.push(entry)
  }
  return { reasons, mitigating }
}

const TONE_ORDER = { bad: 0, warn: 1, ok: 2 }
const byTone = (a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]

// Concrete next steps, from what the evidence and text show.
function verificationSteps(level, textAnalysis, evidenceAnalysis) {
  if (level === 'LOW') return []
  const intents = new Set(textAnalysis?.intents ?? [])
  const signals = evidenceAnalysis?.signals ?? []
  const fields = new Set(signals.filter((signal) => signal.category === 'CONFLICT').map((signal) => signal.field))
  const steps = []
  if (intents.has('changedPaymentDetails') || fields.has('account') || fields.has('bank') || fields.has('payee')) {
    steps.push('Confirm the payee and account details with the payee through a contact you already trust, not one given in the message.')
  }
  if (fields.has('amount') || fields.has('reference') || fields.has('date') || fields.has('currency')) {
    steps.push('Check the amount, reference and dates against the original invoice or agreement.')
  }
  if (intents.has('bankImpersonation') || signals.some((signal) => signal.field === 'senderClaims' || signal.id === 'link.lookalike')) {
    steps.push('Contact the bank through the number on the back of the card or its official app, not through links or numbers in the message.')
  }
  if (intents.has('sensitiveInfoRequest')) steps.push('Do not share one-time codes, PINs or passwords with anyone.')
  steps.push('Review the request before approving it.')
  return steps
}

// --- Model -----------------------------------------------------------------

const BAND_LABELS = { LOW: 'low', ELEVATED: 'elevated', HIGH: 'high' }

// The model's view as supporting information. It never sets the level on its
// own (see aggregation.js).
function modelSupport(mlAnalysis, rulesLevel, agreement, strengthened) {
  if (!mlAnalysis) return []
  if (mlAnalysis.status !== 'AVAILABLE') {
    return [{ source: 'model', tone: null, text: 'The transaction model could not score this request, so only the transaction rules were used for it.' }]
  }
  const band = BAND_LABELS[mlAnalysis.band]
  const text = {
    AGREES: `The transaction model agrees with the transaction rules (${band} model estimate).`,
    MODEL_HIGHER: strengthened
      ? `The transaction model’s ${band} estimate backs up the transaction rules’ concerns.`
      : `Model and transaction rules disagree: the model gives a ${band} estimate, the rules rate the transaction ${RISK_LEVELS[rulesLevel].label.toLowerCase()}. Shown for information; the model does not change the level on its own.`,
    MODEL_LOWER: `Model and transaction rules disagree: the model gives a ${band} estimate. The rules’ assessment is kept; the model never lowers it.`,
  }[agreement]
  return [{ source: 'model', tone: agreement === 'MODEL_HIGHER' ? 'warn' : null, text }, ...modelFactors(mlAnalysis)]
}

const MODEL_FACTOR_COUNT = 3

// The transaction factors that raised an elevated or high model estimate most,
// in plain language (the logistic model's exact per-feature contributions).
// Wording features are left out: the model is scored without the message.
function modelFactors(mlAnalysis) {
  if (mlAnalysis.band === 'LOW') return []
  const factors = mlAnalysis.contributions
    .filter((item) => item.logit > 0 && modelFeatureGroup(item.feature)?.family === 'transaction')
    .slice(0, MODEL_FACTOR_COUNT)
    .map((item) => MODEL_FEATURE_DESCRIPTIONS[item.feature])
  return factors.length ? [{ source: 'model', tone: null, text: `Factors that raised the model estimate most: ${factors.join('; ')}.` }] : []
}

// --- Profile checks -----------------------------------------------------------

function profileReasons(profileFlags) {
  return profileFlags.map((flag) => ({ source: 'profile', signal: flag, tone: 'warn', text: TRANSACTION_PROFILE_FLAGS[flag] }))
}

// --- Drivers --------------------------------------------------------------------

const DRIVER_REASONS_PER_FAMILY = 4

// One reason from each family in turn, so a rule that rests on several
// families shows evidence from every one of them even where the list is
// shortened for display.
function interleave(lists) {
  const merged = []
  const longest = Math.max(0, ...lists.map((list) => list.length))
  for (let i = 0; i < longest; i += 1) for (const list of lists) if (i < list.length) merged.push(list[i])
  return [...new Set(merged)]
}

// Each rule that set the final level, with the reasons behind it. Every reason
// is the text of a finding or signal from a source analysis, so each driver
// can be traced back to the evidence that produced it.
function decisionDrivers({ level, fired, floorApplied, transactionAnalysis, profile, text, evidence, supporting, strengthened }) {
  const engineFindings = (filter) =>
    transactionAnalysis.checks.filter(filter).flatMap((check) => check.findings.filter((finding) => finding.tone !== 'ok').map((finding) => finding.text))
  const byFamily = {
    transaction: [
      ...engineFindings((check) => check.id !== ENGINE_LANGUAGE_CHECK),
      ...profile.map((reason) => reason.text),
      ...(strengthened ? supporting.filter((item) => item.tone === 'warn').map((item) => item.text) : []),
    ],
    message: [
      ...text.map((reason) => reason.text),
      ...evidence.filter((reason) => evidenceSignalFamily(reason.signal) === 'message').map((reason) => reason.text),
    ],
    contradiction: evidence.filter((reason) => reason.category === 'CONFLICT').map((reason) => reason.text),
    engine: engineFindings(() => true),
  }
  const deciding = fired.filter((id) => (id === 'compatibility.floor' ? floorApplied : HYBRID_RULES[id].level === level))
  return deciding.map((rule) => ({
    rule,
    text: HYBRID_RULES[rule].text,
    families: RULE_FAMILIES[rule],
    reasons: interleave(RULE_FAMILIES[rule].map((family) => byFamily[family].slice(0, DRIVER_REASONS_PER_FAMILY))),
  }))
}

// --- Entry point ------------------------------------------------------------

// Assesses a pending standing-order request.
//   request, profile — as for analyseStandingOrder (engine.js);
//   text             — optional message or document text about the request;
//   userBank         — optional customer bank code (MCB / SBM / MAUBANK), used
//                      by the evidence comparison;
//   analysis         — optional existing analyseStandingOrder result, used
//                      as-is; its analysedAt is the snapshot time `asOf`;
//   history          — the user's ledger, for the model and behaviour
//                      (read as of `asOf`);
//   model            — optional prepared fraud model (ml/explain.js
//                      prepareModel, e.g. ml/defaultModel.js).
export function assessStandingOrder({ request: input, profile, text = null, userBank = null, analysis = null, history = null, model = null }) {
  // A request whose requestText is not a string (malformed input) is read as
  // having no request text, rather than reaching components that expect one.
  const request = input.requestText == null || typeof input.requestText === 'string' ? input : { ...input, requestText: null }
  const transactionAnalysis = analysis ?? analyseStandingOrder(request, profile)
  const asOf = transactionAnalysis.analysedAt
  const hasText = typeof text === 'string' && text.trim().length > 0
  const textAnalysis = hasText ? classifyMessage(text) : null
  const evidenceAnalysis = hasText ? compareTextEvidence(text, request, profile, { userBank }) : null

  // Model estimate and behaviour, from the request without its message.
  let mlAnalysis = null
  let features = null
  if (history) {
    if (model) ({ snapshot: mlAnalysis, features } = transactionModelEstimate(model, request, { history, profile, asOf }))
    else features = extractFeatures({ ...request, requestText: '' }, inputsAsOf(history, profile, asOf))
  } else if (model) {
    mlAnalysis = { status: 'UNAVAILABLE', modelVersion: model.modelVersion, asOf, estimate: null, band: null, warnings: ['No ledger history was provided.'] }
  }
  const modelBand = mlAnalysis?.status === 'AVAILABLE' ? mlAnalysis.band : null

  // Families.
  const engineLevel = transactionAnalysis.riskLevel
  const rules = rulesExcludingLanguage(transactionAnalysis)
  const profileFlags = features ? transactionProfileFlags(features) : []
  const transaction = transactionFamily(rules.level, modelBand, profileFlags)
  const message = messageFamily(textAnalysis, evidenceAnalysis)
  const contradiction = contradictionFamily(evidenceAnalysis)
  const agreement = mlAnalysis ? modelAgreement(rules.level, modelBand) : 'UNAVAILABLE'
  const { level, hybridLevel, compatibilityFloor, rules: fired } = aggregate({ engineLevel, rulesLevel: rules.level, transaction, message, contradiction })
  const anomalies = features ? behaviourAnomalies(features) : null

  const risk = {
    transactionRisk: {
      engine: { score: transactionAnalysis.score, level: engineLevel },
      rulesExcludingLanguage: { score: rules.score, level: rules.level },
      profileFlags,
      strength: transaction.strength,
    },
    mlRisk: { band: modelBand, agreement, strengthened: transaction.strengthened },
    behaviouralRisk: { anomalies, countedIn: 'transaction' },
    messageRisk: message,
    evidenceRisk: {
      ...contradiction,
      corroboratedSuspicious: message.corroboratedSuspicious,
      matches: evidenceAnalysis?.summary.matches ?? 0,
    },
  }

  const textPart = textReasons(textAnalysis)
  const evidencePart = evidenceReasons(evidenceAnalysis, textAnalysis)
  const profilePart = profileReasons(profileFlags)
  const parts = [transactionReasons(transactionAnalysis), { reasons: profilePart, mitigating: [] }, textPart, evidencePart]
  const reasons = parts.flatMap((part) => part.reasons).sort(byTone)
  const mitigating = parts.flatMap((part) => part.mitigating)
  const supporting = modelSupport(mlAnalysis, rules.level, agreement, transaction.strengthened)
  const steps = verificationSteps(level, textAnalysis, evidenceAnalysis)
  const drivers = decisionDrivers({
    level,
    fired,
    floorApplied: compatibilityFloor.applied,
    transactionAnalysis,
    profile: profilePart,
    text: [...textPart.reasons].sort(byTone),
    evidence: [...evidencePart.reasons].sort(byTone),
    supporting,
    strengthened: transaction.strengthened,
  })

  const deciding = fired.filter((id) => HYBRID_RULES[id].level === level).map((id) => HYBRID_RULES[id].text)
  const outcome = compatibilityFloor.applied
    ? `Level ${level}: ${HYBRID_RULES['compatibility.floor'].text}`
    : level !== engineLevel
      ? `Level raised from ${engineLevel} to ${level} by: ${deciding.join(' ')}`
      : `Level ${level}.${deciding.length ? ` ${deciding.join(' ')}` : ''}`
  const summary = [
    `Transaction rules: ${rules.level} (${rules.score}/100 with the language check neutralised; original engine ${transactionAnalysis.score}/100, ${engineLevel}).`,
    mlAnalysis
      ? mlAnalysis.status === 'AVAILABLE'
        ? `Model estimate: ${mlAnalysis.band} (synthetic-trained; not calibrated to real-world fraud rates).`
        : 'Model estimate: unavailable.'
      : '',
    textAnalysis
      ? `Message: ${textAnalysis.classification} (classification confidence ${textAnalysis.confidence.toFixed(2)}, not a fraud probability).`
      : 'No message text was provided.',
    evidenceAnalysis
      ? `Evidence: ${evidenceAnalysis.summary.conflicts} conflict(s), ${evidenceAnalysis.summary.matches} match(es), ${evidenceAnalysis.summary.suspicious} suspicious signal(s).`
      : '',
    outcome,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    version: ASSESSMENT_VERSION,
    policy: POLICY_VERSION,
    asOf,
    sources: {
      transaction: `${ENGINE_INFO.id}-${ENGINE_INFO.version}`,
      model: mlAnalysis?.modelVersion ?? null,
      text: textAnalysis ? CLASSIFIER_VERSION : null,
      evidence: evidenceAnalysis ? 'evidence-comparison' : null,
    },
    transactionAnalysis,
    mlAnalysis,
    textAnalysis,
    evidenceAnalysis,
    risk,
    combinedAssessment: {
      level,
      label: RISK_LEVELS[level].label,
      hybridLevel,
      compatibilityFloor,
      transactionLevel: engineLevel,
      transactionScore: transactionAnalysis.score,
      raisedByTextOrEvidence: level !== engineLevel,
      rules: fired,
      families: { transaction: transaction.strength, message: message.strength, contradiction: contradiction.strength },
      drivers,
      reasons,
      mitigating,
      supporting,
      verification: { recommended: level !== 'LOW', steps },
      summary,
    },
  }
}
