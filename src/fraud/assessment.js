import { ENGINE_INFO, RISK_LEVELS, analyseStandingOrder } from './engine.js'
import { CLASSIFIER_VERSION, classifyMessage } from './text/classifier.js'
import { compareTextEvidence } from './text/evidence.js'

// Assessment: the integration boundary that puts three separate analyses of a
// pending standing order side by side and combines them with an explicit,
// deterministic policy.
//
//   transactionAnalysis — the existing rule engine (engine.js), unchanged and
//                         authoritative for the request itself;
//   textAnalysis        — the message classifier (text/classifier.js), from
//                         the text alone;
//   evidenceAnalysis    — what the text says compared with the request and
//                         profile (text/evidence.js).
//
// Each is returned exactly as its component produced it. Nothing here
// recomputes, rescales or replaces them, and there is no combined "fraud
// probability": the three results measure different things and are not
// calibrated against each other.
//
// Combined level policy (vocabulary of engine.js RISK_LEVELS):
//
//   1. Start from the transaction engine's risk level. Text and evidence can
//      raise the level; they never lower it. Matching evidence and reassuring
//      wording are reported as mitigating reasons only.
//   2. Raise to MEDIUM (review) if any of:
//        - the text classifier says "suspicious" or "fraudulent";
//        - the evidence has a conflict with the request;
//        - the evidence has a strong ("bad") suspicious signal (a look-alike
//          bank link, or codes and passwords that the classifier also reads
//          as a request rather than a warning).
//   3. Raise to HIGH if any of:
//        - the text classifier says "fraudulent" and the evidence has a strong
//          conflict with the request (the text and the request disagree);
//        - the evidence has two or more strong conflicts;
//        - the text classifier says "fraudulent" and the transaction engine
//          already says MEDIUM.
//   4. Nothing else changes the level. In particular a text classified
//      "legit_unusual", a sender claim or a plain link is reported but does
//      not raise it, and missing evidence is neither a risk nor a comfort.
//
// Without text, the combined level is the transaction engine's level and the
// text and evidence analyses are null.

export const ASSESSMENT_VERSION = 'assessment-1.0.0'

const LEVEL_ORDER = ['LOW', 'MEDIUM', 'HIGH']
const higher = (a, b) => (LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b)

// The rules of the policy above, in the order they are checked.
export const ASSESSMENT_RULES = {
  'text.suspicious': { level: 'MEDIUM', text: 'The message has several warning signals.' },
  'text.fraudulent': { level: 'MEDIUM', text: 'The message matches common fraud patterns.' },
  'evidence.conflict': { level: 'MEDIUM', text: 'The message disagrees with the request.' },
  'evidence.strongSuspicious': { level: 'MEDIUM', text: 'The message asks for codes or passwords, or links to a look-alike bank site.' },
  'text.fraudulent+evidence.strongConflict': { level: 'HIGH', text: 'The message matches fraud patterns and contradicts the request.' },
  'evidence.multipleStrongConflicts': { level: 'HIGH', text: 'The message contradicts the request on several points.' },
  'text.fraudulent+transaction.medium': { level: 'HIGH', text: 'The message matches fraud patterns and the request already needs review.' },
}

// The evidence layer's sensitive-information signal matches the words (PIN,
// password, one-time code) wherever they appear, including in genuine warnings
// such as "we will never ask for your PIN". The classifier tells a request from
// a warning, so that signal only counts as strong when the classifier also
// found a request.
function isUncorroboratedSensitiveMention(signal, textAnalysis) {
  return signal.id === 'sensitive.request' && !(textAnalysis?.intents ?? []).includes('sensitiveInfoRequest')
}

function firedRules(textAnalysis, evidenceAnalysis, transactionLevel) {
  const classification = textAnalysis?.classification ?? null
  const signals = evidenceAnalysis?.signals ?? []
  const conflicts = signals.filter((signal) => signal.category === 'CONFLICT')
  const strongConflicts = conflicts.filter((signal) => signal.tone === 'bad')
  const strongSuspicious = signals.filter((signal) => signal.category === 'SUSPICIOUS' && signal.tone === 'bad' && !isUncorroboratedSensitiveMention(signal, textAnalysis))

  const fired = []
  if (classification === 'suspicious') fired.push('text.suspicious')
  if (classification === 'fraudulent') fired.push('text.fraudulent')
  if (conflicts.length) fired.push('evidence.conflict')
  if (strongSuspicious.length) fired.push('evidence.strongSuspicious')
  if (classification === 'fraudulent' && strongConflicts.length) fired.push('text.fraudulent+evidence.strongConflict')
  if (strongConflicts.length >= 2) fired.push('evidence.multipleStrongConflicts')
  if (classification === 'fraudulent' && transactionLevel === 'MEDIUM') fired.push('text.fraudulent+transaction.medium')
  return fired
}

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

// --- Entry point ------------------------------------------------------------

// Assesses a pending standing-order request.
//   request, profile — as for analyseStandingOrder (engine.js);
//   text             — optional message or document text about the request;
//   userBank         — optional customer bank code (MCB / SBM / MAUBANK), used
//                      by the evidence comparison;
//   analysis         — optional existing analyseStandingOrder result for this
//                      request and profile (e.g. the one stored on the
//                      transaction), used as-is instead of analysing again.
export function assessStandingOrder({ request, profile, text = null, userBank = null, analysis = null }) {
  const transactionAnalysis = analysis ?? analyseStandingOrder(request, profile)
  const hasText = typeof text === 'string' && text.trim().length > 0
  const textAnalysis = hasText ? classifyMessage(text) : null
  const evidenceAnalysis = hasText ? compareTextEvidence(text, request, profile, { userBank }) : null

  const transactionLevel = transactionAnalysis.riskLevel
  const rules = firedRules(textAnalysis, evidenceAnalysis, transactionLevel)
  const level = rules.reduce((current, id) => higher(current, ASSESSMENT_RULES[id].level), transactionLevel)

  const parts = [transactionReasons(transactionAnalysis), textReasons(textAnalysis), evidenceReasons(evidenceAnalysis, textAnalysis)]
  const reasons = parts.flatMap((part) => part.reasons).sort(byTone)
  const mitigating = parts.flatMap((part) => part.mitigating)
  const steps = verificationSteps(level, textAnalysis, evidenceAnalysis)

  const textPart = textAnalysis
    ? `Message: ${textAnalysis.classification} (classification confidence ${textAnalysis.confidence.toFixed(2)}, not a fraud probability).`
    : 'No message text was provided.'
  const evidencePart = evidenceAnalysis
    ? `Evidence: ${evidenceAnalysis.summary.conflicts} conflict(s), ${evidenceAnalysis.summary.matches} match(es), ${evidenceAnalysis.summary.suspicious} suspicious signal(s).`
    : ''
  const change =
    level === transactionLevel
      ? `Level ${level}, as set by the transaction engine.`
      : `Level raised from ${transactionLevel} to ${level} by: ${rules.filter((id) => ASSESSMENT_RULES[id].level === level).map((id) => ASSESSMENT_RULES[id].text).join(' ')}`

  return {
    version: ASSESSMENT_VERSION,
    sources: {
      transaction: `${ENGINE_INFO.id}-${ENGINE_INFO.version}`,
      text: textAnalysis ? CLASSIFIER_VERSION : null,
      evidence: evidenceAnalysis ? 'evidence-comparison' : null,
    },
    transactionAnalysis,
    textAnalysis,
    evidenceAnalysis,
    combinedAssessment: {
      level,
      label: RISK_LEVELS[level].label,
      transactionLevel,
      transactionScore: transactionAnalysis.score,
      raisedByTextOrEvidence: level !== transactionLevel,
      rules,
      reasons,
      mitigating,
      verification: { recommended: level !== 'LOW', steps },
      summary: [`Transaction engine: ${transactionLevel} (score ${transactionAnalysis.score}/100).`, textPart, evidencePart, change].filter(Boolean).join(' '),
    },
  }
}
