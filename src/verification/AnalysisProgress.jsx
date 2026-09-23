import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'

// Step-by-step progress shown while the analysis "runs". The engine itself is
// synchronous; this paces the reveal so each check is visible.
const STEPS = [
  'Extracting request details',
  'Checking amount',
  'Checking frequency',
  'Checking recipient',
  'Checking user behaviour',
  'Analysing request language',
  'Checking expected request',
  'Calculating fraud risk',
]
const STEP_DURATION_MS = 340
const REDUCED_MOTION_STEP_MS = 60

function AnalysisProgress({ onComplete }) {
  const [completedSteps, setCompletedSteps] = useState(0)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const stepDuration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? REDUCED_MOTION_STEP_MS
    : STEP_DURATION_MS

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (completedSteps < STEPS.length) setCompletedSteps(completedSteps + 1)
      else onCompleteRef.current()
    }, stepDuration)
    return () => window.clearTimeout(timer)
  }, [completedSteps, stepDuration])

  const percent = Math.round((completedSteps / STEPS.length) * 100)

  return (
    <section className="fa-card fa-analysing" aria-live="polite" aria-busy="true">
      <div className="fa-analysing__head">
        <span className="fa-analysing__pulse" aria-hidden="true">
          <Icon name="shield" size={22} />
        </span>
        <div>
          <h2>Analysing standing order…</h2>
          <p>Comparing this request with your usual activity.</p>
        </div>
      </div>
      <div className="fa-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <ol className="fa-analysing__steps">
        {STEPS.map((step, index) => {
          const state = index < completedSteps ? 'done' : index === completedSteps ? 'active' : 'waiting'
          return (
            <li key={step} className={`is-${state}`}>
              <span className="fa-analysing__marker">
                {state === 'done' ? <Icon name="check" size={13} strokeWidth={2.6} /> : null}
              </span>
              {step}
              {state === 'active' ? '…' : ''}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default AnalysisProgress
