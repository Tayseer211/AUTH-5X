import Logo from './Logo.jsx'
import Icon from './Icon.jsx'

// Split-screen layout for the welcome, sign-up and login screens.
function AuthLayout({ children, step, wide = false }) {
  return (
    <div className="fa-auth">
      <aside className="fa-auth__brand">
        <div className="fa-auth__mesh" aria-hidden="true" />
        <div className="fa-auth__brand-content">
          <Logo size={34} tone="light" />
          <p className="fa-auth__tagline">Smarter protection for every transaction.</p>
          <p className="fa-auth__pitch">
            Check every standing order against how you really bank before any money leaves your account.
          </p>
        </div>
        <p className="fa-auth__footnote">Hackathon prototype. All banks, accounts and payments shown are simulated.</p>
      </aside>
      <main className="fa-auth__main">
        <div className={`fa-auth__card ${wide ? 'fa-auth__card--wide' : ''}`}>
          <div className="fa-auth__mobile-logo">
            <Logo size={28} />
          </div>
          {step && <p className="fa-auth__step">{step}</p>}
          {children}
          <p className="fa-auth__secure">
            <Icon name="lock" size={14} />
            Your information is protected with secure encryption.
          </p>
        </div>
      </main>
    </div>
  )
}

export default AuthLayout
