import { ENGINE_LANGUAGE_CHECK } from './signalFamilies.js'

// Hybrid aggregation policy "hybrid-1" (Stage 5). Pure and deterministic: no
// clock, no I/O. It combines three concern families, each counted once:
//
//   transaction   — the rule checks except language (R) and the model's
//                   transaction-only estimate band. Behaviour feeds both and
//                   is never a separate vote.
//   message       — the text classifier, plus strong suspicious evidence the
//                   classifier confirms.
//   contradiction — evidence CONFLICT signals.
//
// Family strengths:
//   transaction   NONE (R LOW) · MODERATE (R MEDIUM) · STRONG (R HIGH, or
//                 R MEDIUM with a HIGH model band)
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
//          H5 two or more bad-level conflicts
//   MEDIUM M1 R = MEDIUM · M2 message ≥ MODERATE · M3 contradiction ≥ WEAK
//   LOW    otherwise
//
// The model alone never changes the level: with R LOW its band is only
// reported as a disagreement, and it never lowers anything. Its one effect is
// H4, strengthening an already-MEDIUM transaction.
//
// Compatibility floor: the final level is max(hybrid level, original engine
// level). The original engine includes the language check, so the floor can
// hold a level the engine reached on wording, but it is never combined with a
// family, so the same words are not counted twice.

export const POLICY_VERSION = 'hybrid-1'

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

// The engine's weighted score (engine.js weightedScore) over every check
// except language, from the analysis's own check scores and weights.
export function rulesExcludingLanguage(analysis) {
  const checks = analysis.checks.filter((check) => check.id !== ENGINE_LANGUAGE_CHECK)
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0)
  const score = totalWeight === 0 ? 0 : Math.round((checks.reduce((sum, check) => sum + check.weight * check.score, 0) / totalWeight) * 100)
  return { score, level: levelForScore(score), checks: checks.map((check) => check.id) }
}

// --- Families ---------------------------------------------------------------

export function transactionFamily(rulesLevel, modelBand) {
  const strengthened = rulesLevel === 'MEDIUM' && modelBand === 'HIGH'
  const strength = rulesLevel === 'HIGH' || strengthened ? 'STRONG' : rulesLevel === 'MEDIUM' ? 'MODERATE' : 'NONE'
  return { strength, strengthened }
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
  return { strength, classification, corroboratedSuspicious: corroborated.length }
}

export function contradictionFamily(evidenceAnalysis) {
  const conflicts = (evidenceAnalysis?.signals ?? []).filter((signal) => signal.category === 'CONFLICT')
  const strongConflicts = conflicts.filter((signal) => signal.tone === 'bad').length
  const weakConflicts = conflicts.length - strongConflicts
  const strength = strongConflicts ? 'STRONG' : weakConflicts ? 'WEAK' : 'NONE'
  return { strength, strongConflicts, weakConflicts }
}

// --- Rules ------------------------------------------------------------------

export const HYBRID_RULES = {
  'transaction.high': { level: 'HIGH', text: 'The transaction itself is high risk.' },
  'message+contradiction': { level: 'HIGH', text: 'The message matches fraud patterns and contradicts the request.' },
  'message+transaction': { level: 'HIGH', text: 'The message matches fraud patterns and the transaction already needs review.' },
  'contradiction+transaction': { level: 'HIGH', text: 'The message contradicts the request, and the transaction model backs up the transaction concerns.' },
  'contradiction.multiple': { level: 'HIGH', text: 'The message contradicts the request on several points.' },
  'transaction.medium': { level: 'MEDIUM', text: 'The transaction has unusual features that need review.' },
  message: { level: 'MEDIUM', text: 'The message has warning signals.' },
  contradiction: { level: 'MEDIUM', text: 'The message disagrees with the request.' },
  'compatibility.floor': { level: null, text: 'Held at the level of the original transaction checks.' },
}

// `families` holds transactionFamily / messageFamily / contradictionFamily
// results plus `rulesLevel` (R). Returns the final and hybrid levels and every
// rule that fired.
export function aggregate({ engineLevel, rulesLevel, transaction, message, contradiction }) {
  const fired = []
  if (rulesLevel === 'HIGH') fired.push('transaction.high')
  if (message.strength === 'STRONG' && contradiction.strength === 'STRONG') fired.push('message+contradiction')
  if (message.strength === 'STRONG' && transaction.strength !== 'NONE') fired.push('message+transaction')
  if (contradiction.strength === 'STRONG' && transaction.strength === 'STRONG') fired.push('contradiction+transaction')
  if (contradiction.strongConflicts >= 2) fired.push('contradiction.multiple')
  if (rulesLevel === 'MEDIUM') fired.push('transaction.medium')
  if (message.strength !== 'NONE') fired.push('message')
  if (contradiction.strength !== 'NONE') fired.push('contradiction')

  const hybridLevel = fired.reduce((level, id) => higherLevel(level, HYBRID_RULES[id].level), 'LOW')
  const level = higherLevel(hybridLevel, engineLevel)
  const floorApplied = level !== hybridLevel
  if (floorApplied) fired.push('compatibility.floor')
  return { level, hybridLevel, compatibilityFloor: { level: engineLevel, applied: floorApplied }, rules: fired }
}
