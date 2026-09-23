import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { AuthError, createAccount, getSessionUser, logIn, logOut } from '../auth/authService.js'
import {
  TransactionError,
  approveTransaction,
  getApprovalQueue,
  getLedgerStats,
  loadLedger,
  rejectTransaction,
  replayDemoRequests,
  requestMoreInformation,
  resetLedger,
  saveAnalysis,
} from '../transactions/ledger.js'
import { assessPendingRequest } from '../transactions/requestAssessment.js'
import { navigate } from '../router/router.jsx'

// Single app-wide store: the signed-in user, their ledger, the in-progress
// sign-up draft, and every action the screens can take. Actions throw
// AuthError / TransactionError / StorageError with user-facing messages.

const AppContext = createContext(null)

function restoreSession() {
  const user = getSessionUser()
  return { user, ledger: user ? loadLedger(user) : null }
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(restoreSession)
  const [signUpDraft, setSignUpDraft] = useState(null)
  const { user, ledger } = session

  // After an async sign-in, the new session and the route change must render
  // together. React 18 renders the router's hashchange update (a discrete
  // event) ahead of a plain state update, so the router would briefly see the
  // new route without a user (or the old route with one) and redirect away —
  // e.g. skipping the "Account created" screen.
  const signInAndGo = useCallback((signedInUser, to) => {
    flushSync(() => {
      setSession({ user: signedInUser, ledger: loadLedger(signedInUser) })
      navigate(to, { replace: true })
    })
  }, [])

  // Creates the account from the sign-up draft, then shows /signup/complete.
  const completeSignUp = useCallback(
    async (bank) => {
      if (!signUpDraft) throw new AuthError('Your sign-up details expired. Start again.')
      const newUser = await createAccount({ ...signUpDraft, bank })
      setSignUpDraft(null)
      signInAndGo(newUser, '/signup/complete')
      return newUser
    },
    [signUpDraft, signInAndGo],
  )

  // Logs in, then shows the dashboard.
  const handleLogIn = useCallback(
    async (credentials) => {
      const loggedIn = await logIn(credentials)
      signInAndGo(loggedIn, '/dashboard')
      return loggedIn
    },
    [signInAndGo],
  )

  const handleLogOut = useCallback(() => {
    logOut()
    setSession({ user: null, ledger: null })
  }, [])

  // Runs a ledger mutation synchronously so callers can catch its error.
  const updateLedger = useCallback(
    (mutate) => {
      if (!user || !ledger) throw new TransactionError("You're signed out. Log in again.")
      const next = mutate(ledger)
      setSession((previous) => ({ ...previous, ledger: next }))
      return next
    },
    [user, ledger],
  )

  const actions = useMemo(
    () => ({
      runAnalysis: (txId) =>
        updateLedger((current) => {
          const tx = current.transactions.find((item) => item.id === txId)
          if (!tx) throw new TransactionError('This transaction could not be found.')
          const { analysis, assessment } = assessPendingRequest(tx, current.transactions, user)
          return saveAnalysis(user.id, current, txId, analysis, assessment)
        }),
      approve: (txId, options) => updateLedger((current) => approveTransaction(user.id, current, txId, options)),
      requestInfo: (txId, request) => updateLedger((current) => requestMoreInformation(user.id, current, txId, request)),
      reject: (txId) => updateLedger((current) => rejectTransaction(user.id, current, txId)),
      replayDemo: () => updateLedger((current) => replayDemoRequests(user, current)),
      resetDemo: () => updateLedger(() => resetLedger(user)),
    }),
    [updateLedger, user],
  )

  const value = useMemo(() => {
    const transactions = ledger?.transactions ?? []
    return {
      user,
      transactions,
      stats: getLedgerStats(transactions),
      queue: getApprovalQueue(transactions),
      getTransaction: (txId) => transactions.find((tx) => tx.id === txId) ?? null,
      signUpDraft,
      setSignUpDraft,
      completeSignUp,
      logIn: handleLogIn,
      logOut: handleLogOut,
      ...actions,
    }
  }, [user, ledger, signUpDraft, completeSignUp, handleLogIn, handleLogOut, actions])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
