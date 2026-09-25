import { useState } from 'react'
import Button from '../components/Button.jsx'
import ReceiptWarning from '../components/ReceiptWarning.jsx'
import { Alert, StatusBadge } from '../components/Feedback.jsx'
import { Link, navigate } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { formatDateTime } from '../utils/format.js'
import RequestDetails from '../verification/RequestDetails.jsx'
import AnalysisProgress from '../verification/AnalysisProgress.jsx'
import AnalysisResults from '../verification/AnalysisResults.jsx'
import AssessmentSummary from '../verification/AssessmentSummary.jsx'
import { awaitingDecision, needsEngineRun, openingPhase } from '../verification/decisionState.js'
import DecisionPanel from '../verification/DecisionPanel.jsx'
import RequestInfoModal from '../verification/RequestInfoModal.jsx'

const DECISION_OUTCOMES = {
  APPROVED: {
    tone: 'success',
    title: 'Approved',
    text: 'The standing order was approved and added to your transaction history.',
  },
  INFO_REQUESTED: {
    tone: 'warning',
    title: 'Additional information requested',
    text: 'This transaction stays flagged until the information you asked for is provided.',
  },
  REJECTED: {
    tone: 'danger',
    title: 'Rejected',
    text: 'The standing order was rejected and no payment will be scheduled.',
  },
}

// Standing-order verification: request details -> animated analysis ->
// results + decision. `phase` is 'request' | 'analysing' | 'results'.
function VerifyPage({ txId }) {
  const { user, getTransaction, runAnalysis, approve, requestInfo, reject } = useApp()
  const tx = getTransaction(txId)
  // A pending request that already has a stored analysis (the demo batch
  // analyses at reset) still opens with the progress animation; it only
  // presents the stored result, see finishAnalysis.
  const [phase, setPhase] = useState(() => openingPhase(tx))
  const [error, setError] = useState('')
  const [approving, setApproving] = useState(false)
  const [infoModalOpen, setInfoModalOpen] = useState(false)

  if (!tx) {
    return (
      <div className="fa-page">
        <Alert tone="danger" title="Transaction not found">
          This transaction no longer exists. <Link to="/review">Back to approvals</Link>.
        </Alert>
      </div>
    )
  }

  const decided = Boolean(tx.decision)
  const analysis = tx.analysis

  // Called when the progress animation finishes. The engine runs here only for a
  // request that has no stored analysis; otherwise the stored analysis and
  // assessment are revealed as they are.
  function finishAnalysis() {
    try {
      if (needsEngineRun(tx)) runAnalysis(tx.id)
      setPhase('results')
    } catch (analysisError) {
      setError(analysisError.message)
      setPhase('request')
    }
  }

  function startAnalysis() {
    setError('')
    setPhase(analysis && !awaitingDecision(tx) ? 'results' : 'analysing')
  }

  function handleApprove(options) {
    setApproving(true)
    try {
      approve(tx.id, options)
      navigate(`/proof/${tx.id}`)
    } catch (approveError) {
      setError(approveError.message)
      setApproving(false)
    }
  }

  function handleRequestInfo(request) {
    try {
      requestInfo(tx.id, request)
      setInfoModalOpen(false)
      setError('')
    } catch (requestError) {
      setInfoModalOpen(false)
      setError(requestError.message)
    }
  }

  function handleReject() {
    try {
      reject(tx.id)
      setError('')
    } catch (rejectError) {
      setError(rejectError.message)
    }
  }

  const outcome = decided ? DECISION_OUTCOMES[tx.decision.action] : null

  return (
    <div className="fa-page">
      <Button href="#/review" variant="ghost" icon="arrowLeft" className="fa-back">
        Back to approvals
      </Button>
      <header className="fa-page__header">
        <div>
          <h1 className="fa-page__title">Verify standing order</h1>
          <p className="fa-page__subtitle">Reference {tx.reference}</p>
        </div>
        <StatusBadge status={tx.status} />
      </header>

      {error && <Alert tone="danger">{error}</Alert>}

      {outcome && (
        <Alert tone={outcome.tone} title={outcome.title}>
          {outcome.text} Decided {formatDateTime(tx.decision.at)}.
          {tx.decision.action === 'APPROVED' && (
            <>
              {' '}
              <Link to={`/proof/${tx.id}`}>View proof of payment</Link>.
            </>
          )}
        </Alert>
      )}

      <div className="fa-verify">
        <div className="fa-verify__main">
          <RequestDetails tx={tx} user={user} />

          {phase === 'analysing' && <AnalysisProgress onComplete={finishAnalysis} />}

          {phase !== 'analysing' && analysis && <AnalysisResults analysis={analysis} />}

          {phase !== 'analysing' && analysis && tx.assessment && <AssessmentSummary analysis={analysis} assessment={tx.assessment} />}

          {phase === 'request' && !analysis && (
            <section className="fa-card fa-prompt">
              <h2>Check this request before you approve it</h2>
              <p>
                fraud.auth runs six checks against your normal activity, including the wording of the request. It takes
                a few seconds.
              </p>
              <div className="fa-inline-actions">
                <Button size="lg" onClick={startAnalysis}>
                  Run risk assessment
                </Button>
              </div>
            </section>
          )}

          {phase !== 'analysing' && awaitingDecision(tx) && (
            <DecisionPanel
              analysis={analysis}
              assessment={tx.assessment}
              busy={approving}
              error={null}
              onApprove={handleApprove}
              onRequestInfo={() => setInfoModalOpen(true)}
              onReject={handleReject}
            />
          )}

          {decided && (
            <div className="fa-inline-actions">
              <Button href="#/review">Back to approvals</Button>
              <Button href="#/history" variant="secondary">
                View transaction history
              </Button>
            </div>
          )}
        </div>
        <aside className="fa-verify__aside">
          <ReceiptWarning />
        </aside>
      </div>

      {analysis && (
        <RequestInfoModal
          open={infoModalOpen}
          tx={tx}
          analysis={analysis}
          onClose={() => setInfoModalOpen(false)}
          onSubmit={handleRequestInfo}
        />
      )}
    </div>
  )
}

export default VerifyPage
