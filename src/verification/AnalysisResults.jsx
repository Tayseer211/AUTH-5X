import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { RiskBadge } from '../components/Feedback.jsx'
import { RISK_LEVELS } from '../fraud/engine.js'
import { formatDateTime } from '../utils/format.js'

const CHECK_STATUS = {
  PASS: { label: 'Passed', icon: 'check', tone: 'success' },
  WARN: { label: 'Unusual', icon: 'warning', tone: 'warning' },
  FAIL: { label: 'Failed', icon: 'x', tone: 'danger' },
}
const RISK_TONES = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' }

const RING_RADIUS = 52

function ScoreRing({ score, tone }) {
  const circumference = 2 * Math.PI * RING_RADIUS
  return (
    <div className={`fa-score-ring fa-score-ring--${tone}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={RING_RADIUS} className="fa-score-ring__track" />
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          className="fa-score-ring__value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <span className="fa-score-ring__number">{score}%</span>
    </div>
  )
}

// One expandable check. Checks that didn't pass start expanded.
function CheckItem({ check }) {
  const [open, setOpen] = useState(check.status !== 'PASS')
  const status = CHECK_STATUS[check.status]

  return (
    <li className={`fa-check fa-check--${status.tone}`}>
      <button type="button" className="fa-check__head" onClick={() => setOpen((isOpen) => !isOpen)} aria-expanded={open}>
        <span className="fa-check__icon">
          <Icon name={status.icon} size={14} strokeWidth={2.6} />
        </span>
        <span className="fa-check__label">{check.label}</span>
        <span className="fa-check__status">{status.label}</span>
        <Icon name="chevronDown" size={16} className={`fa-check__chevron ${open ? 'is-open' : ''}`} />
      </button>
      {open && (
        <ul className="fa-check__findings">
          {check.findings.map((finding) => (
            <li key={finding.text} className={`is-${finding.tone}`}>
              {finding.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function AnalysisResults({ analysis }) {
  const tone = RISK_TONES[analysis.riskLevel]
  const counts = analysis.checks.reduce(
    (totals, check) => ({ ...totals, [check.status]: (totals[check.status] ?? 0) + 1 }),
    {},
  )

  return (
    <section className="fa-card fa-results" aria-labelledby="results-title">
      <div className="fa-card__header">
        <h2 id="results-title">Fraud analysis</h2>
        <RiskBadge level={analysis.riskLevel} />
      </div>
      <div className="fa-results__summary">
        <ScoreRing score={analysis.score} tone={tone} />
        <div>
          <p className="fa-results__label">Risk assessment score</p>
          <p className={`fa-results__verdict fa-text--${tone}`}>{RISK_LEVELS[analysis.riskLevel].label}</p>
          <p className="fa-results__explain">
            {counts.PASS ?? 0} passed, {counts.WARN ?? 0} unusual, {counts.FAIL ?? 0} failed. Higher scores mean the
            request closely matches your normal, expected activity.
          </p>
        </div>
      </div>
      <ul className="fa-checks">
        {analysis.checks.map((check) => (
          <CheckItem key={check.id} check={check} />
        ))}
      </ul>
      <p className="fa-results__footnote">
        This is a risk assessment to support your decision, not proof of fraud. {analysis.engine.label}, analysed{' '}
        {formatDateTime(analysis.analysedAt)}.
      </p>
    </section>
  )
}

export default AnalysisResults
