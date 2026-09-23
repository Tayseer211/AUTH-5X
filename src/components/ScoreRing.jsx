import './ScoreRing.css'

const RADIUS = 50
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Circular gauge showing the 0-100 safety score from a completed
// verification, color-coded by tone (success/warning/danger).
function ScoreRing({ score, tone }) {
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE

  return (
    <div className={`score-ring score-ring--${tone}`}>
      <svg viewBox="0 0 120 120">
        <circle className="score-ring__track" cx="60" cy="60" r={RADIUS} />
        <circle
          className="score-ring__value"
          cx="60"
          cy="60"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="score-ring__number">{score}</span>
    </div>
  )
}

export default ScoreRing
