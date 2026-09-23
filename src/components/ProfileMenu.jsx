import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import Button from './Button.jsx'
import Modal from './Modal.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { navigate } from '../router/router.jsx'
import { getBank } from '../data/banks.js'
import { maskAccountNumber } from '../utils/format.js'

function initials(fullName) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

// Header account menu: simulated bank details, log out, and reset demo data.
function ProfileMenu() {
  const { user, logOut, resetDemo } = useApp()
  const [open, setOpen] = useState(false)
  const [showAccountNumber, setShowAccountNumber] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetError, setResetError] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setShowAccountNumber(false)
      return undefined
    }

    const onMouseDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false)

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const bank = getBank(user.bank.code)

  function handleLogOut() {
    logOut()
    navigate('/login', { replace: true })
  }

  function handleReset() {
    try {
      resetDemo()
      setConfirmReset(false)
      setOpen(false)
      navigate('/dashboard')
    } catch (error) {
      setResetError(error.message)
    }
  }

  return (
    <div className="fa-profile" ref={menuRef}>
      <button
        type="button"
        className="fa-profile__trigger"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="fa-avatar">{initials(user.fullName)}</span>
        <span className="fa-profile__name">{user.fullName.split(' ')[0]}</span>
        <Icon name="chevronDown" size={16} />
      </button>

      {open && (
        <div className="fa-profile__panel" role="dialog" aria-label="Account details">
          <div className="fa-profile__head">
            <span className="fa-avatar fa-avatar--lg">{initials(user.fullName)}</span>
            <div>
              <p className="fa-profile__fullname">{user.fullName}</p>
              <p className="fa-profile__email">{user.email}</p>
            </div>
          </div>
          <dl className="fa-profile__details">
            <div>
              <dt>Bank</dt>
              <dd>{bank?.name ?? user.bank.code}</dd>
            </div>
            <div>
              <dt>Account holder</dt>
              <dd>{user.bank.accountHolder}</dd>
            </div>
            <div>
              <dt>Account number</dt>
              <dd className="fa-profile__account">
                <span className="fa-mono">
                  {showAccountNumber ? user.bank.accountNumber : maskAccountNumber(user.bank.accountNumber)}
                </span>
                <button
                  type="button"
                  className="fa-icon-btn"
                  onClick={() => setShowAccountNumber((shown) => !shown)}
                  aria-label={showAccountNumber ? 'Hide account number' : 'Show account number'}
                  aria-pressed={showAccountNumber}
                >
                  <Icon name={showAccountNumber ? 'eyeOff' : 'eye'} />
                </button>
              </dd>
            </div>
          </dl>
          <p className="fa-profile__note">Simulated account for demonstration only.</p>
          <Button variant="secondary" block icon="logout" onClick={handleLogOut}>
            Log out
          </Button>
          <button type="button" className="fa-profile__reset" onClick={() => setConfirmReset(true)}>
            Reset demo data
          </button>
        </div>
      )}

      <Modal
        open={confirmReset}
        title="Reset demo data?"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon="refresh" onClick={handleReset}>
              Reset demo data
            </Button>
          </>
        }
      >
        <p>
          This restores the original sample transactions and three pending standing orders for this account. Your
          login and bank details are kept.
        </p>
        {resetError && <p className="fa-field__error">{resetError}</p>}
      </Modal>
    </div>
  )
}

export default ProfileMenu
