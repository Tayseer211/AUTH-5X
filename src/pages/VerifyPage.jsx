import { useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell.jsx'
import ScoreRing from '../components/ScoreRing.jsx'
import Modal from '../components/Modal.jsx'
import {
  ArrowLeftIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
  ChevronDownIcon,
  FlagIcon,
} from '../components/icons.jsx'
import { computeVerification, VERIFICATION_STEPS } from '../utils/verification.js'
import './VerifyPage.css'

const STEP_DURATION_MS = 550

const FLAG_REASONS = [
  "I don't recognize this recipient",
  'The message feels urgent or unusual',
  'The requested account or details recently changed',
  'I want my bank to investigate further',
]

const STATUS_ICON = {
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  danger: XCircleIcon,
}

function formatCurrency(tx) {
  return `$${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function CheckRow({ check, open, onToggle }) {
  const Icon = STATUS_ICON[check.status]

  return (
    <li className={`check check--${check.status}`}>
      <button type="button" className="check__head" onClick={onToggle} aria-expanded={open}>
        <span className="check__icon">
          <Icon />
        </span>
        <span className="check__label">{check.label}</span>
        <span className="check__status">{check.status}</span>
        <ChevronDownIcon className={`check__chevron${open ? ' is-open' : ''}`} />
      </button>
      {open && (
        <ul className="check__findings">
          {check.findings.map((finding) => (
            <li key={finding} className={`is-${check.status === 'success' ? 'ok' : check.status === 'warning' ? 'warn' : 'bad'}`}>
              {finding}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// Core of the app: shows the payment request, runs the simulated fraud
// checks, then lets the user approve, deny, or flag it. Three phases:
// 'review' -> 'analysing' -> 'results'.
function VerifyPage({ user, transaction, pendingCount, onNavigate, onDecision, onSignOut, onResetDemo }) {
  const [phase, setPhase] = useState('review')
  const [stepIndex, setStepIndex] = useState(-1)
  const [openCheckId, setOpenCheckId] = useState(null)
  const [flagModalOpen, setFlagModalOpen] = useState(false)
  const [flagReason, setFlagReason] = useState(FLAG_REASONS[0])

  const verification = useMemo(() => computeVerification(transaction), [transaction])

  useEffect(() => {
    if (phase !== 'analysing') return undefined

    if (stepIndex >= VERIFICATION_STEPS.length - 1) {
      const finishTimer = setTimeout(() => setPhase('results'), STEP_DURATION_MS)
      return () => clearTimeout(finishTimer)
    }

    const timer = setTimeout(() => setStepIndex((prev) => prev + 1), STEP_DURATION_MS)
    return () => clearTimeout(timer)
  }, [phase, stepIndex])

  const startVerification = () => {
    setStepIndex(-1)
    setPhase('analysing')
  }

  const finalizeDecision = (status, reason) => {
    onDecision(transaction.id, {
      transactionId: transaction.id,
      recipient: transaction.recipient,
      amount: transaction.amount,
      status,
      reason,
      score: verification.score,
      tone: verification.tone,
    })
  }

  const progressPercent = phase === 'analysing' ? ((stepIndex + 1) / VERIFICATION_STEPS.length) * 100 : 0

  return (
    <AppShell
      user={user}
      activeView="approvals"
      pendingCount={pendingCount}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      onResetDemo={onResetDemo}
    >
      <div className="page">
        <button type="button" className="btn btn--ghost back-link" onClick={() => onNavigate('approvals')}>
          <ArrowLeftIcon />
          Back to approvals
        </button>

        <div className="verify-layout">
          <div className="verify-layout__main">
            <div className="card">
              <div className="card__header">
                <h2>Payment request</h2>
                <span className="badge badge--warning">Needs review</span>
              </div>
              <p className="request__amount">{formatCurrency(transaction)}</p>
              <p className="request__to">to {transaction.recipient}</p>

              <dl className="request__grid">
                <div>
                  <dt>Channel</dt>
                  <dd>{transaction.channel}</dd>
                </div>
                <div>
                  <dt>Requested via</dt>
                  <dd>{transaction.requestedVia}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{formatDate(transaction.date)}</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>{transaction.reference}</dd>
                </div>
              </dl>

              {transaction.message && (
                <div className="request__text">
                  <p className="request__text-label">Message included with the request</p>
                  <blockquote>&ldquo;{transaction.message}&rdquo;</blockquote>
                </div>
              )}
            </div>

            {phase === 'review' && (
              <div className="card prompt">
                <h2>Ready to verify?</h2>
                <p>
                  fraud.auth will check the recipient, the message, your spending patterns, and more
                  before you decide what to do with this request.
                </p>
                <button type="button" className="btn btn--primary" onClick={startVerification}>
                  Run verification
                </button>
              </div>
            )}

            {phase === 'analysing' && (
              <div className="card">
                <div className="analysing__head">
                  <span className="analysing__pulse">
                    <ShieldCheckIcon />
                  </span>
                  <div>
                    <h2>Verifying this request&hellip;</h2>
                    <p>This usually takes just a few seconds.</p>
                  </div>
                </div>
                <div className="progress">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <ul className="analysing__steps">
                  {VERIFICATION_STEPS.map((step, index) => (
                    <li
                      key={step}
                      className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-active' : ''}
                    >
                      <span className="analysing__marker">{index < stepIndex ? <CheckCircleIcon /> : null}</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {phase === 'results' && (
              <>
                <div className="card">
                  <div className="results__summary">
                    <ScoreRing score={verification.score} tone={verification.tone} />
                    <div>
                      <p className="results__label">Safety score</p>
                      <p className={`results__verdict text--${verification.tone}`}>{verification.verdict}</p>
                      <p className="results__explain">{verification.explanation}</p>
                    </div>
                  </div>

                  <ul className="checks">
                    {verification.checks.map((check) => (
                      <CheckRow
                        key={check.id}
                        check={check}
                        open={openCheckId === check.id}
                        onToggle={() => setOpenCheckId((prev) => (prev === check.id ? null : check.id))}
                      />
                    ))}
                  </ul>

                  <p className="results__footnote">
                    fraud.auth is a simulated hackathon prototype — these checks illustrate the product
                    idea and are not a real fraud detection model.
                  </p>
                </div>

                <div className="card decision">
                  <h2 className="decision__title">What would you like to do?</h2>
                  <p className="decision__text">
                    You&apos;re always in control. fraud.auth only flags risk — it never sends or blocks a
                    payment on its own.
                  </p>
                  <div className="decision__actions">
                    <button type="button" className="btn btn--primary" onClick={() => finalizeDecision('approved')}>
                      Approve payment
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => finalizeDecision('denied')}>
                      Deny payment
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => setFlagModalOpen(true)}>
                      <FlagIcon />
                      Flag as suspicious
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <aside className="verify-layout__side card">
            <h2 className="side-title">Why this matters</h2>
            <p className="side-note">
              Scammers often impersonate people or companies you already know, then ask for payment
              through an urgent, unfamiliar channel. Verifying before you send gives you a chance to
              catch it.
            </p>
            <p className="side-note">
              If anything here feels off, deny the request or flag it — you can always ask the
              recipient to confirm the details another way first.
            </p>
          </aside>
        </div>
      </div>

      <Modal
        open={flagModalOpen}
        title="Flag this request"
        onClose={() => setFlagModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setFlagModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setFlagModalOpen(false)
                finalizeDecision('flagged', flagReason)
              }}
            >
              Submit flag
            </button>
          </>
        }
      >
        <p className="modal__lede">
          We won&apos;t approve or deny this payment for you. Flagging keeps it out of the queue and
          notes why you were suspicious, in case you want to look back at it later.
        </p>
        <div>
          <span className="modal__label">What made this look suspicious?</span>
          <div className="modal__options">
            {FLAG_REASONS.map((reason) => (
              <label key={reason} className="choice-field">
                <input
                  type="radio"
                  name="flag-reason"
                  value={reason}
                  checked={flagReason === reason}
                  onChange={() => setFlagReason(reason)}
                />
                <span>{reason}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}

export default VerifyPage
