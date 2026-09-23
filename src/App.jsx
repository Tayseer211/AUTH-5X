import { useState } from 'react'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ApprovalQueuePage from './pages/ApprovalQueuePage.jsx'
import VerifyPage from './pages/VerifyPage.jsx'
import ReceiptPage from './pages/ReceiptPage.jsx'
import { INITIAL_TRANSACTIONS } from './data/mockData.js'

// The demo user we "log in" as — there's no backend, so login/signup just
// swap in a user object and move to the dashboard.
const DEMO_USER = {
  name: 'Jordan Ellis',
  email: 'jordan.ellis@example.com',
  bankName: 'Chase',
  accountLast4: '4821',
}

// Simple hand-rolled view state machine (no router dependency, since the
// flow is linear and doesn't need deep links or browser back/forward):
// login -> signup -> dashboard -> approvals -> verify -> receipt -> dashboard
function App() {
  const [view, setView] = useState('login')
  const [user, setUser] = useState(null)
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS)
  const [selectedTxId, setSelectedTxId] = useState(null)
  const [lastDecision, setLastDecision] = useState(null)

  const pendingCount = transactions.filter((tx) => tx.status === 'pending').length

  const openVerification = (txId) => {
    setSelectedTxId(txId)
    setView('verify')
  }

  const recordDecision = (txId, decision) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === txId ? { ...tx, status: decision.status } : tx))
    )
    setLastDecision(decision)
    setView('receipt')
  }

  const handleSignOut = () => {
    setUser(null)
    setSelectedTxId(null)
    setLastDecision(null)
    setView('login')
  }

  const handleResetDemo = () => {
    setTransactions(INITIAL_TRANSACTIONS)
  }

  if (view === 'login') {
    return (
      <LoginPage
        onLoginSuccess={() => {
          setUser(DEMO_USER)
          setView('dashboard')
        }}
        onCreateAccount={() => setView('signup')}
      />
    )
  }

  if (view === 'signup') {
    return (
      <SignupPage
        onComplete={(newUser) => {
          setUser(newUser)
          setView('dashboard')
        }}
        onBackToLogin={() => setView('login')}
      />
    )
  }

  const sharedProps = {
    user,
    pendingCount,
    onNavigate: setView,
    onSignOut: handleSignOut,
    onResetDemo: handleResetDemo,
  }

  if (view === 'approvals') {
    return (
      <ApprovalQueuePage
        {...sharedProps}
        transactions={transactions.filter((tx) => tx.status === 'pending')}
        onSelectTransaction={openVerification}
      />
    )
  }

  if (view === 'verify') {
    const selectedTx = transactions.find((tx) => tx.id === selectedTxId)
    if (selectedTx) {
      return <VerifyPage {...sharedProps} transaction={selectedTx} onDecision={recordDecision} />
    }
  }

  if (view === 'receipt' && lastDecision) {
    return <ReceiptPage {...sharedProps} decision={lastDecision} />
  }

  return (
    <DashboardPage
      {...sharedProps}
      transactions={transactions}
      onSelectTransaction={openVerification}
    />
  )
}

export default App
