import { useEffect, useRef, useState } from 'react'
import { ShieldCheckIcon, LogOutIcon, ChevronDownIcon } from './icons.jsx'
import './AppShell.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'approvals', label: 'Approvals' },
]

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Shared shell for every screen after login: sticky header with nav +
// profile menu, wrapping whatever page content is passed as children.
function AppShell({ user, activeView, pendingCount, onNavigate, onSignOut, onResetDemo, children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined

    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__bar">
          <button type="button" className="app-shell__logo" onClick={() => onNavigate('dashboard')}>
            <ShieldCheckIcon className="app-shell__logo-icon" />
            <span>
              fraud<span className="app-shell__logo-dot">.</span>auth
            </span>
          </button>

          <nav className="app-shell__nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-link${activeView === item.id ? ' is-active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
                {item.id === 'approvals' && pendingCount > 0 && (
                  <span className="nav-link__count">{pendingCount}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="profile-menu" ref={menuRef}>
            <button
              type="button"
              className="profile-menu__trigger"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
            >
              <span className="avatar">{initials(user.name)}</span>
              <span className="profile-menu__name">{user.name}</span>
              <ChevronDownIcon className="profile-menu__chevron" />
            </button>

            {menuOpen && (
              <div className="profile-menu__panel">
                <div className="profile-menu__head">
                  <span className="avatar avatar--lg">{initials(user.name)}</span>
                  <div>
                    <div className="profile-menu__fullname">{user.name}</div>
                    <div className="profile-menu__email">{user.email}</div>
                  </div>
                </div>

                <dl className="profile-menu__details">
                  <div>
                    <dt>Linked bank</dt>
                    <dd>{user.bankName}</dd>
                  </div>
                  <div>
                    <dt>Account</dt>
                    <dd className="mono">•••• {user.accountLast4}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="btn btn--secondary btn--block"
                  onClick={() => {
                    onResetDemo()
                    setMenuOpen(false)
                  }}
                >
                  Reset demo data
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--block"
                  onClick={onSignOut}
                >
                  <LogOutIcon className="profile-menu__sign-out-icon" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-shell__main">{children}</main>

      <footer className="app-shell__footer">
        fraud.auth is a simulated hackathon prototype. No real bank accounts or payments are involved.
      </footer>
    </div>
  )
}

export default AppShell
