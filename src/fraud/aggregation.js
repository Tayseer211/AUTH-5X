import { ENGINE_LANGUAGE_CHECK, MESSAGE_INTENT_FACTS, evidenceSignalFact } from './signalFamilies.js'

// Hybrid aggregation policy "hybrid-2" (Stage 6). Pure and deterministic: no
// clock, no I/O. It combines three concern families, each counted once:
//
//   transaction   — the rule checks with the language check neutralised (R),
//                   deterministic profile checks the rules do not make (a
//                   changed account or a look-alike name for a known payee),
//                   and the model's transaction-only estimate band.
//                   Behaviour feeds the rules and the model and is never a
//                   separate vote.
//   message       — the text classifier, plus strong suspicious evidence the
//                   classifier confirms.
//   contradiction — evidence CONFLICT signals, counted per payment fact.
//
// Family strengths:
//   transaction   NONE · MODERATE (R MEDIUM, or a profile check) · STRONG
//                 (R HIGH, or MODERATE with a HIGH model band)
//   message       NONE · MODERATE (classified suspicious, or confirmed strong
//                 suspicious evidence) · STRONG (classified fraudulent)
//   contradiction NONE · WEAK (warning-level conflicts only) · STRONG (a
//                 bad-level conflict)
//
// Levels, first match wins:
//   HIGH   H1 R = HIGH
//          H2 message STRONG and contradiction STRONG
//          H3 message STRONG and transaction ≥ MODERATE
//          H4 contradiction STRONG and transaction STRONG
//          H5 bad-level conflicts on two or more different payment facts
//          H6 all three families present: transaction ≥ MODERATE, message
//             ≥ MODERATE and contradiction STRONG
//          H7 message MODERATE and a bad-level conflict on a fact the
//             message's own warnings are not about (independent evidence)
//   MEDIUM M1 R = MEDIUM · M2 message ≥ MODERATE · M3 contradiction ≥ WEAK
//          M4 a profile check
//   LOW    otherwise
//
// The model alone never changes the level: with R LOW its band is only
// reported as a disagreement, and it never lowers anything. Its one effect is
// to strengthen an already-MEDIUM transaction (H4).
//
// Compatibility floor: the final level is max(hybrid level, original engine
// level). The original engine includes the language check, so the floor can
// hold a level the engine reached on wording, but it is never combined with a
// family, so the same words are not counted twice.
//
// Changes from hybrid-1 (Stage 5): R neutralises the language check instead of
// dropping it (dropping a passing check re-weighted the others and could turn
// a LOW request MEDIUM); conflicts count per fact (one currency difference is
// not two contradictions); H6, H7 and M4 are new.

export const POLICY_VERSION = 'hybrid-2'

const LEVELS = ['LOW', 'MEDIUM', 'HIGH']
export const higherLevel = (a, b) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b)

// The engine's score → level cut-offs (engine.js riskLevelFor, which is not
// exported). A parity test keeps them in step with the engine.
export const ENGINE_LEVEL_CUTOFFS = { low: 85, medium: 40 }

export function levelForScore(score) {
  if (score >= ENGINE_LEVEL_CUTOFFS.low) return 'LOW'
  if (score >= ENGINE_LEVEL_CUTOFFS.medium) return 'MEDIUM'
  return 'HIGH'
}

// The engine's weighted score (engine.js weightedScore) with the language
// check treated as passed, from the analysis's own check scores and weights.
// Its evidence is the message, which the message family covers; neutralising
// it (rather than dropping it) removes only the wording's penalty and leaves
// every other check's share of the score unchanged, so R is never below the
// engine's own score.
export function rulesExcludingLanguage(analysis) {
  const totalWeight = analysis.checks.reduce((sum, check) => sum + check.weight, 0)
  const weighted = analysis.checks.reduce((sum, check) => sum + check.weight * (check.id === ENGINE_LANGUAGE_CHECK ? 1 : check.score), 0)
  const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100)
  return { score, level: levelForScore(score), neutralised: ENGINE_LANGUAGE_CHECK }
}

// --- Families ---------------------------------------------------------------

// `profileFlags` are TRANSACTION_PROFILE_FLAGS ids that fired.
export function transactionFamily(rulesLevel, modelBand, profileFlags = []) {
  const review = rulesLevel === 'MEDIUM' || (rulesLevel === 'LOW' && profileFlags.length > 0)
  const strengthened = review && modelBand === 'HIGH'
  const strength = rulesLevel === 'HIGH' || strengthened ? 'STRONG' : review ? 'MODERATE' : 'NONE'
  return { strength, strengthened, profileFlags: [...profileFlags] }
}

// How the model's band relates to the rules. Reported, never scored.
export function modelAgreement(rulesLevel, modelBand) {
  if (!modelBand) return 'UNAVAILABLE'
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 }[rulesLevel]
  const bandRank = { LOW: 0, ELEVATED: 1, HIGH: 2 }[modelBand]
  if (bandRank > rank) return 'MODEL_HIGHER'
  if (bandRank < rank) return 'MODEL_LOWER'
  return 'AGREES'
}

// The evidence layer flags code/PIN words wherever they appear, including in
// genuine warnings ("we will never ask for your PIN"). Such a signal only
// counts when the classifier also read the text as a request.
export function isUncorroboratedSensitiveMention(signal, textAnalysis) {
  return signal.id === 'sensitive.request' && !(textAnalysis?.intents ?? []).includes('sensitiveInfoRequest')
}

export function messageFamily(textAnalysis, evidenceAnalysis) {
  const corroborated = (evidenceAnalysis?.signals ?? []).filter(
    (signal) => signal.category === 'SUSPICIOUS' && signal.tone === 'bad' && !isUncorroboratedSensitiveMention(signal, textAnalysis),
  )
  const classification = textAnalysis?.classification ?? null
  const strength = classification === 'fraudulent' ? 'STRONG' : classification === 'suspicious' || corroborated.length ? 'MODERATE' : 'NONE'
  // The payment facts the message's own warnings are about.
  const facts = [...new Set((textAnalysis?.intents ?? []).flatMap((intent) => MESSAGE_INTENT_FACTS[intent] ?? []))].sort()
  return { strength, classification, corroboratedSuspicious: corroborated.length, facts }
}

export function contradictionFamily(evidenceAnalysis) {
  const conflicts = (evidenceAnalysis?.signals ?? []).filter((signal) => signal.category === 'CONFLICT')
  const strongFacts = [...new Set(conflicts.filter((signal) => signal.tone === 'bad').map((signal) => evidenceSignalFact(signal.id)))].sort()
  const weakFacts = [...new Set(conflicts.filter((signal) => signal.tone !== 'bad').map((signal) => evidenceSignalFact(signal.id)))]
    .filter((fact) => !strongFacts.includes(fact))
    .sort()
  const strength = strongFacts.length ? 'STRONG' : weakFacts.length ? 'WEAK' : 'NONE'
  return { strength, strongConflicts: strongFacts.length, weakConflicts: weakFacts.length, strongFacts, weakFacts }
}

// --- Rules ------------------------------------------------------------------

export const HYBRID_RULES = {
  'transaction.high': { level: 'HIGH', text: 'The transaction itself is high risk.' },
  'message+contradiction': { level: 'HIGH', text: 'The message matches fraud patterns and contradicts the request.' },
  'message+transaction': { level: 'HIGH', text: 'The message matches fraud patterns and the transaction already needs review.' },
  'contradiction+transaction': { level: 'HIGH', text: 'The message contradicts the request, and the transaction model backs up the transaction concerns.' },
  'contradiction.multiple': { level: 'HIGH', text: 'The message contradicts the request on several points.' },
  'all.families': { level: 'HIGH', text: 'The transaction, the message and a contradiction with the request all point the same way.' },
  'message+independentContradiction': { level: 'HIGH', text: 'The message has warning signals and also contradicts the request on a separate point.' },
  'transaction.medium': { level: 'MEDIUM', text: 'The transaction has unusual features that need review.' },
  'transaction.profile': { level: 'MEDIUM', text: 'The payee details differ from your history with this payee.' },
  message: { level: 'MEDIUM', text: 'The message has warning signals.' },
  contradiction: { level: 'MEDIUM', text: 'The message disagrees with the request.' },
  'compatibility.floor': { level: null, text: 'Held at the level of the original transaction checks.' },
}

// Which families each rule rests on, for explanations.
export const RULE_FAMILIES = {
  'transaction.high': ['transaction'],
  'message+contradiction': ['message', 'contradiction'],
  'message+transaction': ['message', 'transaction'],
  'contradiction+transaction': ['contradiction', 'transaction'],
  'contradiction.multiple': ['contradiction'],
  'all.families': ['transaction', 'message', 'contradiction'],
  'message+independentContradiction': ['message', 'contradiction'],
  'transaction.medium': ['transaction'],
  'transaction.profile': ['transaction'],
  message: ['message'],
  contradiction: ['contradiction'],
  'compatibility.floor': ['engine'],
}

// `rulesLevel` is R; `transaction`, `message` and `contradiction` are the
// family summaries above. Returns the final and hybrid levels and every rule
// that fired.
export function aggregate({ engineLevel, rulesLevel, transaction, message, contradiction }) {
  const independentFacts = (contradiction.strongFacts ?? []).filter((fact) => !(message.facts ?? []).includes(fact))
  const fired = []
  if (rulesLevel === 'HIGH') fired.push('transaction.high')
  if (message.strength === 'STRONG' && contradiction.strength === 'STRONG') fired.push('message+contradiction')
  if (message.strength === 'STRONG' && transaction.strength !== 'NONE') fired.push('message+transaction')
  if (contradiction.strength === 'STRONG' && transaction.strength === 'STRONG') fired.push('contradiction+transaction')
  if (contradiction.strongConflicts >= 2) fired.push('contradiction.multiple')
  if (transaction.strength !== 'NONE' && message.strength !== 'NONE' && contradiction.strength === 'STRONG') fired.push('all.families')
  if (message.strength === 'MODERATE' && independentFacts.length) fired.push('message+independentContradiction')
  if (rulesLevel === 'MEDIUM') fired.push('transaction.medium')
  if ((transaction.profileFlags ?? []).length) fired.push('transaction.profile')
  if (message.strength !== 'NONE') fired.push('message')
  if (contradiction.strength !== 'NONE') fired.push('contradiction')

  const hybridLevel = fired.reduce((level, id) => higherLevel(level, HYBRID_RULES[id].level), 'LOW')
  const level = higherLevel(hybridLevel, engineLevel)
  const floorApplied = level !== hybridLevel
  if (floorApplied) fired.push('compatibility.floor')
  return { level, hybridLevel, compatibilityFloor: { level: engineLevel, applied: floorApplied }, rules: fired }
}
