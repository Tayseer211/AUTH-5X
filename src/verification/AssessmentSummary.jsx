import { RiskBadge } from '../components/Feedback.jsx'
import { HYBRID_RULES } from '../fraud/aggregation.js'
import { RISK_LEVELS } from '../fraud/engine.js'
import { BEHAVIOUR_ANOMALY_FLAGS, TRANSACTION_PROFILE_FLAGS } from '../fraud/signalFamilies.js'

// The assessment layer's results, shown under the transaction checks. The
// transaction checks above stay the original engine's own result; this card
// adds the other sources and the level the decision is gated on.
//
// Assessments from Stage 5 on (with `risk`) show every source separately.
// Older Stage 4 assessments keep their original "Message and evidence" card.

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

// Stage 5 wording.
const LEVEL_SHORT = { LOW: 'Low', MEDIUM: 'Review', HIGH: 'High' }
const MODEL_BANDS = { LOW: 'Low estimate', ELEVATED: 'Elevated estimate', HIGH: 'High estimate' }
const MESSAGE_READING = {
  legit_normal: 'No significant fraud indicators',
  legit_unusual: 'Unusual wording, no significant fraud indicators',
  suspicious: 'Several warning signals',
  fraudulent: 'Matches common fraud patterns',
}

function ReasonList({ items }) {
  return (
    <ul className="fa-check__findings">
      {items.map((item) => (
        <li key={`${item.source}:${item.text}`} className={`is-${item.tone ?? 'ok'}`}>
          {item.text}
        </li>
      ))}
    </ul>
  )
}

function ReasonSections({ combined }) {
  return (
    <>
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
    </>
  )
}

// --- Stage 5 ----------------------------------------------------------------

function modelRow(mlAnalysis, agreement) {
  if (!mlAnalysis) return 'Not used for this assessment'
  if (mlAnalysis.status !== 'AVAILABLE') return 'Not available for this request'
  const disagreement = agreement === 'MODEL_HIGHER' || agreement === 'MODEL_LOWER' ? ' · Model and transaction rules disagree' : ''
  return `${MODEL_BANDS[mlAnalysis.band]} · Synthetic-trained model${disagreement}`
}

function behaviourRow(anomalies, profileFlags = []) {
  if (anomalies == null) return 'Not assessed'
  const items = [...anomalies.map((flag) => BEHAVIOUR_ANOMALY_FLAGS[flag]), ...profileFlags.map((flag) => TRANSACTION_PROFILE_FLAGS[flag])]
  if (!items.length) return 'No departures from your usual pattern'
  return `${items.join('; ')} (counted with the transaction rules)`
}

function evidenceRow(evidenceAnalysis, evidenceRisk) {
  if (!evidenceAnalysis) return 'No message to compare with the request'
  if (evidenceRisk.strength === 'STRONG') return 'Contradicts the request'
  if (evidenceRisk.strength === 'WEAK') return 'Minor differences from the request'
  return evidenceAnalysis.status === 'CONSISTENT' ? 'No contradiction detected; details match the request' : 'No contradiction detected'
}

function combinedExplanation(combined) {
  if (combined.compatibilityFloor?.applied) return HYBRID_RULES['compatibility.floor'].text
  const deciding = combined.rules.filter((id) => HYBRID_RULES[id]?.level === combined.level).map((id) => HYBRID_RULES[id].text)
  if (deciding[0]) return deciding[0]
  // Nothing raised the level. Points that were noted are still listed below.
  return combined.reasons.length > 0 ? 'Some points below are worth a look, but none raised the level.' : 'No source raised the level.'
}

function HybridSummary({ analysis, assessment }) {
  const { combined, mlAnalysis, textAnalysis, evidenceAnalysis, risk } = assessment
  const rules = risk.transactionRisk.rulesExcludingLanguage
  const rows = [
    [
      'Transaction rules',
      `${analysis.score} · ${LEVEL_SHORT[analysis.riskLevel]}${rules.score !== analysis.score ? ` (${rules.score} · ${LEVEL_SHORT[rules.level]} setting the wording check aside)` : ''}`,
    ],
    ['Transaction model', modelRow(mlAnalysis, risk.mlRisk.agreement)],
    ['Behaviour', behaviourRow(risk.behaviouralRisk.anomalies, risk.transactionRisk.profileFlags)],
    [
      'Message',
      textAnalysis
        ? `${MESSAGE_READING[textAnalysis.classification]} · classification confidence ${textAnalysis.confidence.toFixed(2)}`
        : 'No message came with this request',
    ],
    ['Evidence', evidenceRow(evidenceAnalysis, risk.evidenceRisk)],
    ['Combined assessment', `${combined.level} · ${combinedExplanation(combined)}`],
  ]

  return (
    <section className="fa-card fa-results" aria-labelledby="assessment-title">
      <div className="fa-card__header">
        <h2 id="assessment-title">Combined assessment</h2>
        <RiskBadge level={combined.level} />
      </div>
      <dl className="fa-request__grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {combined.drivers?.length > 0 && (
        <>
          <p className="fa-results__label">Why this level</p>
          <ul className="fa-check__findings">
            {combined.drivers.map((driver) => (
              <li key={driver.rule} className={`is-${combined.level === 'HIGH' ? 'bad' : 'warn'}`}>
                {driver.text}
                {driver.reasons.length > 0 && ` ${driver.reasons.slice(0, 3).join(' ')}`}
              </li>
            ))}
          </ul>
        </>
      )}
      {combined.supporting?.length > 0 && (
        <>
          <p className="fa-results__label">Transaction model</p>
          <ReasonList items={combined.supporting} />
        </>
      )}
      <ReasonSections combined={combined} />

      <p className="fa-results__footnote">
        Each source is counted once: the transaction rules, model and behaviour are one view of the transaction; the
        message and any contradiction with the request are separate. The model estimate comes from a synthetic-trained
        model that is not calibrated to real-world fraud rates, and the message classification confidence is not a fraud
        probability. The combined level is never below the original transaction checks.
      </p>
    </section>
  )
}

// --- Stage 4 ----------------------------------------------------------------

function Stage4Summary({ analysis, assessment }) {
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

      <ReasonSections combined={combined} />

      <p className="fa-results__footnote">
        The message classification is a text analysis with a classification confidence, not a fraud probability. The
        combined level starts from the transaction checks and can only be raised by the message and evidence.
      </p>
    </section>
  )
}

function AssessmentSummary({ analysis, assessment }) {
  return assessment.risk ? <HybridSummary analysis={analysis} assessment={assessment} /> : <Stage4Summary analysis={analysis} assessment={assessment} />
}

export default AssessmentSummary
