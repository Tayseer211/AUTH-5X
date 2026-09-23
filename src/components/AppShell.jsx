import Logo from './Logo.jsx'
import ProfileMenu from './ProfileMenu.jsx'
import { Link } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', match: (path) => path === '/dashboard' },
  {
    to: '/review',
    label: 'Approvals',
    match: (path) => path === '/review' || path.startsWith('/verify') || path.startsWith('/proof'),
    countKey: 'awaitingApproval',
  },
  { to: '/history', label: 'Transaction history', shortLabel: 'History', match: (path) => path === '/history' },
]

// Signed-in layout: header with nav + account menu, page content, footer.
function AppShell({ path, children }) {
  const { stats } = useApp()

  return (
    <div className="fa-shell">
      <header className="fa-shell__header fa-no-print">
        <div className="fa-shell__bar">
          <Link to="/dashboard" className="fa-shell__logo" aria-label="fraud.auth dashboard">
            <Logo size={28} />
          </Link>
          <nav className="fa-shell__nav" aria-label="Main">
            {NAV_ITEMS.map((item) => {
              const active = item.match(path)
              const count = item.countKey ? stats[item.countKey] : 0
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`fa-nav-link ${item.shortLabel ? 'fa-nav-link--dual' : ''} ${active ? 'is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="fa-nav-link__full">{item.label}</span>
                  {item.shortLabel && <span className="fa-nav-link__short">{item.shortLabel}</span>}
                  {count > 0 && <span className="fa-nav-link__count">{count}</span>}
                </Link>
              )
            })}
          </nav>
          <ProfileMenu />
        </div>
      </header>
      <main className="fa-shell__main">{children}</main>
      <footer className="fa-shell__footer fa-no-print">
        fraud.auth hackathon prototype. Simulated banking data only; no real accounts or payments are involved.
      </footer>
    </div>
  )
}

export default AppShell
