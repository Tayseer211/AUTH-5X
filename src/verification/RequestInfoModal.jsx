import { useState } from 'react'
import Modal from '../components/Modal.jsx'
import Button from '../components/Button.jsx'
import { Alert } from '../components/Feedback.jsx'
import { formatMoney } from '../utils/format.js'

const INFO_OPTIONS = [
  'Signed agreement or contract for this arrangement',
  'Invoice or reference matching the amount',
  "Confirmation of the recipient's account details",
  'Written confirmation from a contact I already hold',
  'Explanation of the requested frequency',
]

// Lets the user hold a request and list what they need before deciding.
// Simulation only: nothing is sent anywhere.
function RequestInfoModal({ open, tx, analysis, onClose, onSubmit }) {
  const [selected, setSelected] = useState([INFO_OPTIONS[0], INFO_OPTIONS[1]])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const failedChecks = analysis.checks.filter((check) => check.status === 'FAIL').map((check) => check.label)

  function toggle(option) {
    setSelected((current) => (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]))
    setError('')
  }

  function submit() {
    try {
      onSubmit({ items: selected, note })
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  return (
    <Modal
      open={open}
      title="Request additional information"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Send request</Button>
        </>
      }
    >
      <div>
        <p className="fa-modal__lede">
          Reason for request: the standing order of {formatMoney(tx.amount)} to {tx.recipient} did not pass the risk
          assessment ({analysis.score}%).
        </p>
      </div>

      {failedChecks.length > 0 && (
        <div>
          <p className="fa-modal__label">Detected risk indicators</p>
          <ul className="fa-modal__indicators">
            {failedChecks.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="fa-modal__label">Information requested</p>
        <div className="fa-modal__options">
          {INFO_OPTIONS.map((option) => (
            <label key={option} className="fa-checkbox">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="fa-modal__label" htmlFor="info-note">
          Note (optional)
        </label>
        <textarea
          id="info-note"
          className="fa-textarea"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add anything else you want confirmed before this payment goes ahead."
        />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Alert tone="info">
        Simulation only. No email is sent and no bank is contacted. The transaction stays flagged with the analysis
        results attached.
      </Alert>
    </Modal>
  )
}

export default RequestInfoModal
