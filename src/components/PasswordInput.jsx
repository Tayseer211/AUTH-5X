import { useId, useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons.jsx'
import './PasswordInput.css'

// Reusable password field with a show/hide toggle.
function PasswordInput({ id, label, value, onChange, error, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id || generatedId
  const errorId = `${inputId}-error`

  return (
    <div className="password-input">
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      <div
        className={`password-input__wrapper${
          error ? ' password-input__wrapper--error' : ''
        }`}
      >
        <input
          id={inputId}
          name={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="password-input__field"
        />
        <button
          type="button"
          className="password-input__toggle"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOffIcon className="password-input__icon" />
          ) : (
            <EyeIcon className="password-input__icon" />
          )}
        </button>
      </div>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default PasswordInput
