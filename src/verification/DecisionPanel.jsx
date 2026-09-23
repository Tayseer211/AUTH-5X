import { useState } from 'react'
import Button from '../components/Button.jsx'
import { Alert } from '../components/Feedback.jsx'

// Approve / request info / reject, gated by the risk level:
//   LOW    — approve directly
//   MEDIUM — approve only after acknowledging the listed warnings
//   HIGH   — approval is not offered
function DecisionPanel({ analysis, onApprove, onRequestInfo, onReject, error, busy }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const { riskLevel } = analysis
  const warnings = analysis.checks
    .filter((check) => check.status !== 'PASS')
    .flatMap((check) => check.findings.filter((finding) => finding.tone !== 'ok').map((finding) => finding.text))

  const title =
    riskLevel === 'LOW'
      ? 'Ready to approve'
      : riskLevel === 'MEDIUM'
        ? 'Review required'
        : 'This transaction cannot currently be approved'

  return (
    <section className="fa-card fa-decision" aria-labelledby="decision-title">
      <h2 id="decision-title" className="fa-decision__title">
        {title}
      </h2>

      {riskLevel === 'LOW' && (
        <p className="fa-decision__text">
          Every check matched your usual activity. Approving sets up the standing order on your simulated account.
        </p>
      )}

      {riskLevel === 'MEDIUM' && (
        <>
          <p className="fa-decision__text">
            Most checks passed, but some details don&apos;t match your usual pattern. That doesn&apos;t mean the request
            is fraudulent — check these points before you decide.
          </p>
          <ul className="fa-decision__warnings">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <label className="fa-checkbox fa-decision__ack">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>I have checked these points with the recipient through a channel I trust.</span>
          </label>
        </>
      )}

      {riskLevel === 'HIGH' && (
        <Alert tone="danger" title="Additional information is required before proceeding.">
          Multiple checks failed, including the wording of the request itself. Contact the recipient using details you
          already hold — not any contact details in the request.
        </Alert>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="fa-decision__actions">
        {riskLevel !== 'HIGH' && (
          <Button
            size="lg"
            loading={busy}
            disabled={riskLevel === 'MEDIUM' && !acknowledged}
            onClick={() => onApprove({ acknowledgedWarnings: acknowledged })}
          >
            Approve transaction
          </Button>
        )}
        <Button variant={riskLevel === 'HIGH' ? 'primary' : 'secondary'} size="lg" onClick={onRequestInfo}>
          Request additional information
        </Button>
        <Button variant="danger" size="lg" onClick={onReject}>
          Reject
        </Button>
      </div>
    </section>
  )
}

export default DecisionPanel
