import AppShell from './components/AppShell.jsx'
import { Alert } from './components/Feedback.jsx'
import { Redirect, matchRoute, useHashLocation } from './router/router.jsx'
import { useApp } from './state/AppProvider.jsx'
import { hasAnyAccount } from './auth/authService.js'
import { storage } from './storage/storage.js'
import WelcomePage from './pages/WelcomePage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import BankDetailsPage from './pages/BankDetailsPage.jsx'
import AccountCreatedPage from './pages/AccountCreatedPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ApprovalQueuePage from './pages/ApprovalQueuePage.jsx'
import VerifyPage from './pages/VerifyPage.jsx'
import ProofPage from './pages/ProofPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'

// Pages that require a signed-in user and render inside the app shell.
function renderAppPage(path, query) {
  if (path === '/dashboard') return <DashboardPage />
  if (path === '/review') return <ApprovalQueuePage />
  if (path === '/history') return <HistoryPage query={query} />

  const verify = matchRoute('/verify/:id', path)
  if (verify) return <VerifyPage txId={verify.id} />

  const proof = matchRoute('/proof/:id', path)
  if (proof) return <ProofPage txId={proof.id} />

  return null
}

// Routes:
//   /                 welcome (or redirect to /login or /dashboard)
//   /signup           step 1: account details
//   /signup/bank      step 2: bank details
//   /signup/complete  confirmation
//   /login
//   /dashboard, /review, /history, /verify/:id, /proof/:id   (signed in)
function App() {
  const { user } = useApp()
  const { path, query } = useHashLocation()

  const storageWarning = !storage.isPersistent && (
    <Alert tone="warning" title="Saved data is unavailable">
      Your browser is blocking local storage, so this account will not survive a refresh. Enable site data to keep it.
    </Alert>
  )

  if (path === '/') {
    if (user) return <Redirect to="/dashboard" />
    return hasAnyAccount() ? <Redirect to="/login" /> : <WelcomePage />
  }
  if (path === '/signup') return user ? <Redirect to="/dashboard" /> : <SignupPage />
  if (path === '/signup/bank') return user ? <Redirect to="/dashboard" /> : <BankDetailsPage />
  if (path === '/login') return user ? <Redirect to="/dashboard" /> : <LoginPage />
  if (path === '/signup/complete') return user ? <AccountCreatedPage /> : <Redirect to="/login" />

  const page = renderAppPage(path, query)
  if (!page) return <Redirect to={user ? '/dashboard' : '/'} />
  if (!user) return <Redirect to="/login" />

  return (
    <AppShell path={path}>
      {storageWarning}
      {page}
    </AppShell>
  )
}

export default App
