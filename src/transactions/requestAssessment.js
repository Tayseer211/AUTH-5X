import { assessStandingOrder } from '../fraud/assessment.js'
import { deriveUserProfile } from '../fraud/profile.js'

// Bridges the app's pending standing orders and the assessment layer
// (fraud/assessment.js). Everything is derived from existing state:
//   request  — the pending transaction itself;
//   profile  — derived from the user's ledger, as before;
//   text     — the message that came with the request (tx.requestText), or
//              none when the request has no message;
//   userBank — the user's bank code, for the evidence comparison.
//
// The transaction engine's result is stored on the transaction as
// `analysis`, exactly as before, so every existing screen keeps working. The
// assessment is stored next to it as `assessment`, without a second copy of
// the engine result, its findings or the message text.

// The message text to analyse, or null when the request has none.
export function requestMessage(tx) {
  return typeof tx.requestText === 'string' && tx.requestText.trim() ? tx.requestText : null
}

// Assesses a pending transaction against the user's ledger. Returns the
// engine analysis to store as `analysis` and the compact assessment to store
// as `assessment`.
export function assessPendingRequest(tx, transactions, user) {
  const assessment = assessStandingOrder({
    request: tx,
    profile: deriveUserProfile(transactions),
    text: requestMessage(tx),
    userBank: user?.bank?.code ?? null,
  })
  return { analysis: assessment.transactionAnalysis, assessment: toStoredAssessment(assessment) }
}

// The assessment without the transaction analysis and without reasons that
// only repeat the engine's own findings (those are already in `analysis`).
export function toStoredAssessment({ version, sources, textAnalysis, evidenceAnalysis, combinedAssessment }) {
  const notTransaction = (reason) => reason.source !== 'transaction'
  return {
    version,
    sources,
    textAnalysis,
    evidenceAnalysis,
    combined: {
      ...combinedAssessment,
      reasons: combinedAssessment.reasons.filter(notTransaction),
      mitigating: combinedAssessment.mitigating.filter(notTransaction),
    },
  }
}

// The level that decides what the user may do: the combined assessment level
// when there is one, otherwise the engine's level (ledgers analysed before the
// assessment layer existed).
export function decisionLevel(tx) {
  return tx.assessment?.combined?.level ?? tx.analysis?.riskLevel ?? null
}
