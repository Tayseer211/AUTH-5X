import { RiskBadge } from '../components/Feedback.jsx'
import { RISK_LEVELS } from '../fraud/engine.js'

// Message and evidence results from the assessment layer, shown under the
// transaction checks. The transaction checks above stay the engine's own
// result; this card adds what the request's message says and the level the
// decision is gated on.

const CLASSIFICATIONS = {
  legit_normal: 'Reads as a routine message',
  legit_unusual: 'Reads as genuine but unusual',
  suspicious: 'Contains several warning signals',
  fraudulent: 'Matches common fraud patterns',
}

const EVIDENCE_STATUS = {
  CONSISTENT: 'Details in the message match the request.',
  CONFLICTING: 'Details in the message conflict with the request.',
  SUSPICIOUS: 'The message has suspicious details; nothing in it contradicts the request.',
  UNVERIFIED: 'The message has details the request does not record, so they could not be compared.',
  NO_EVIDENCE: 'The message has no payment details to compare with the request.',
}

function ReasonList({ items }) {
  return (
    <ul className="fa-check__findings">
      {items.map((item) => (
        <li key={`${item.source}:${item.text}`} className={`is-${item.tone}`}>
          {item.text}
        </li>
      ))}
    </ul>
  )
}

function AssessmentSummary({ analysis, assessment }) {
  const { combined, textAnalysis, evidenceAnalysis } = assessment

  if (!textAnalysis) {
    return (
      <section className="fa-card fa-results" aria-labelledby="assessment-title">
        <div className="fa-card__header">
          <h2 id="assessment-title">Message and evidence</h2>
        </div>
        <p className="fa-results__explain">No message came with this request, so only the transaction checks were used.</p>
      </section>
    )
  }

  return (
    <section className="fa-card fa-results" aria-labelledby="assessment-title">
      <div className="fa-card__header">
        <h2 id="assessment-title">Message and evidence</h2>
        <RiskBadge level={combined.level} />
      </div>
      <p className="fa-results__explain">
        <strong>Combined assessment: {RISK_LEVELS[combined.level].label}.</strong>{' '}
        {combined.raisedByTextOrEvidence
          ? `Raised from the transaction risk (${RISK_LEVELS[combined.transactionLevel].label}, ${analysis.score}%) by the message and evidence.`
          : `Same as the transaction risk (${analysis.score}%).`}
      </p>
      <p className="fa-results__explain">
        <strong>Message:</strong> {CLASSIFICATIONS[textAnalysis.classification]} (classification confidence{' '}
        {textAnalysis.confidence.toFixed(2)}).
      </p>
      <p className="fa-results__explain">
        <strong>Evidence:</strong> {EVIDENCE_STATUS[evidenceAnalysis.status]}
      </p>

      {combined.reasons.length > 0 && (
        <>
          <p className="fa-results__label">What to look at</p>
          <ReasonList items={combined.reasons} />
        </>
      )}
      {combined.mitigating.length > 0 && (
        <>
          <p className="fa-results__label">What supports the request</p>
          <ReasonList items={combined.mitigating} />
        </>
      )}
      {combined.verification.steps.length > 0 && (
        <>
          <p className="fa-results__label">Before you decide</p>
          <ReasonList items={combined.verification.steps.map((text) => ({ source: 'step', tone: 'warn', text }))} />
        </>
      )}

      <p className="fa-results__footnote">
        The message classification is a text analysis with a classification confidence, not a fraud probability. The
        combined level starts from the transaction checks and can only be raised by the message and evidence.
      </p>
    </section>
  )
}

export default AssessmentSummary
