import { useId, useState } from 'react'
import Icon from './Icon.jsx'

// Labelled input with hint/error text. Password fields get a show/hide toggle.
function TextField({ label, type = 'text', value, onChange, error, hint, autoComplete, inputMode, name, autoFocus }) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ')

  return (
    <div className={`fa-field ${error ? 'fa-field--error' : ''}`}>
      <label className="fa-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="fa-field__control">
        <input
          id={id}
          name={name}
          className="fa-field__input"
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
        />
        {isPassword && (
          <button
            type="button"
            className="fa-field__action"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} />
          </button>
        )}
      </div>
      {hint && !error && (
        <p className="fa-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="fa-field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

export default TextField
