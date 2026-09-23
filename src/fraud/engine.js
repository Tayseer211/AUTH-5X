import {
  checkAmount,
  checkBehaviour,
  checkExpectedRequest,
  checkFrequency,
  checkLanguage,
  checkRecipient,
} from './checks.js'

// Weighted rule-based fraud engine for standing-order requests.
//
// Each check produces a 0–1 score; the overall score is the weighted average
// scaled to 0–100. Higher means the request matches the user's normal,
// expected activity (it is a safety score, not a fraud probability).
// `profile` is derived from the user's ledger by deriveUserProfile
// (profile.js). Against the seed history, the three demo cases score
// LEGITIMATE 100, GREY 69, FRAUD 8.

export const CHECKS = [
  { id: 'amount', label: 'Amount analysis', weight: 25, run: checkAmount },
  { id: 'frequency', label: 'Frequency analysis', weight: 10, run: checkFrequency },
  { id: 'recipient', label: 'Recipient analysis', weight: 20, run: checkRecipient },
  { id: 'behaviour', label: 'User behaviour', weight: 25, run: checkBehaviour },
  { id: 'language', label: 'NLP text analysis', weight: 15, run: checkLanguage },
  { id: 'expected', label: 'Expected request check', weight: 5, run: checkExpectedRequest },
]

const STATUS_THRESHOLDS = { pass: 0.85, warn: 0.35 }

function checkStatus(score) {
  if (score >= STATUS_THRESHOLDS.pass) return 'PASS'
  if (score >= STATUS_THRESHOLDS.warn) return 'WARN'
  return 'FAIL'
}

function weightedScore(results) {
  const totalWeight = results.reduce((sum, check) => sum + check.weight, 0)
  const weighted = results.reduce((sum, check) => sum + check.weight * check.score, 0)
  return totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100)
}

function riskLevelFor(score) {
  if (score >= 85) return 'LOW'
  if (score >= 40) return 'MEDIUM'
  return 'HIGH'
}

export const RISK_LEVELS = {
  LOW: { label: 'Low risk', verdict: 'All checks passed' },
  MEDIUM: { label: 'Review required', verdict: 'Some indicators need your attention' },
  HIGH: { label: 'High risk', verdict: 'Multiple risk indicators found' },
}

export const ENGINE_INFO = { id: 'rules', version: '1.0.0', label: 'Rule-based risk engine (simulation)' }

export function analyseStandingOrder(request, profile) {
  const checks = CHECKS.map((check) => {
    const { score, findings } = check.run(request, profile)
    const clamped = Math.min(1, Math.max(0, score))
    return {
      id: check.id,
      label: check.label,
      weight: check.weight,
      score: clamped,
      status: checkStatus(clamped),
      findings,
    }
  })

  const score = weightedScore(checks)
  return {
    engine: ENGINE_INFO,
    checks,
    score,
    riskLevel: riskLevelFor(score),
    analysedAt: new Date().toISOString(),
  }
}
