import { useState } from 'react'
import { CheckCircleIcon } from './icons.jsx'
import { BANKS, bankMonogram } from '../data/mockData.js'
import './BankPicker.css'

// Step 2 of signup: pick a bank to "link" (no real bank connection — the
// selection just feeds the mock account summary on the next step).
function BankPicker({ onSelect }) {
  const [selectedId, setSelectedId] = useState(null)

  const handleContinue = (event) => {
    event.preventDefault()
    const bank = BANKS.find((b) => b.id === selectedId)
    if (bank) {
      onSelect(bank)
    }
  }

  return (
    <form onSubmit={handleContinue}>
      <fieldset className="bank-picker">
        <legend className="visually-hidden">Choose your bank</legend>
        <div className="bank-picker__grid">
          {BANKS.map((bank) => {
            const selected = bank.id === selectedId
            return (
              <label
                key={bank.id}
                className={`bank-card${selected ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="bank"
                  value={bank.id}
                  checked={selected}
                  onChange={() => setSelectedId(bank.id)}
                  className="visually-hidden"
                />
                <span className="bank-card__monogram">{bankMonogram(bank.name)}</span>
                <span className="bank-card__name">{bank.name}</span>
                <span className="bank-card__check">
                  <CheckCircleIcon />
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <button type="submit" className="primary-button bank-picker__continue" disabled={!selectedId}>
        Link bank &amp; continue
      </button>
    </form>
  )
}

export default BankPicker
