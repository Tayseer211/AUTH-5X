import { storage } from '../storage/storage.js'
import { createId } from '../utils/ids.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { createDemoRequests } from '../data/demoCases.js'
import { decisionLevel } from './requestAssessment.js'

// Each user's simulated ledger lives under `fraudauth:v1:ledger:<userId>` as
// `{ transactions, demoRun }`. Every mutation here is pure with respect to
// its input ledger: it returns a new ledger and persists it.
//
// Status lifecycle for a standing-order request:
//   PENDING (requiresApproval) --runAnalysis--> PENDING + analysis (+ assessment)
//     --approve-----> APPROVED (+ proof of payment)
//     --requestInfo-> FLAGGED  (decision INFO_REQUESTED)
//     --reject------> REJECTED

export class TransactionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TransactionError'
  }
}

const ledgerKey = (userId) => `ledger:${userId}`

function createInitialLedger(user) {
  return {
    transactions: [...createSeedTransactions(), ...createDemoRequests(user, { run: 1 })],
    demoRun: 1,
  }
}

// Loads the saved ledger, creating (and saving) the seed ledger on first use.
export function loadLedger(user) {
  const saved = storage.read(ledgerKey(user.id))
  if (saved?.transactions) return saved

  const ledger = createInitialLedger(user)
  storage.write(ledgerKey(user.id), ledger)
  return ledger
}

function saveLedger(userId, ledger) {
  storage.write(ledgerKey(userId), ledger)
  return ledger
}

function updateTransaction(userId, ledger, txId, update) {
  const tx = ledger.transactions.find((item) => item.id === txId)
  if (!tx) throw new TransactionError('This transaction could not be found.')

  const updated = { ...tx, ...update(tx), updatedAt: new Date().toISOString() }
  return saveLedger(userId, {
    ...ledger,
    transactions: ledger.transactions.map((item) => (item.id === txId ? updated : item)),
  })
}

function assertAwaitingDecision(tx) {
  if (tx.status !== 'PENDING' || !tx.requiresApproval) {
    throw new TransactionError('This transaction has already been processed.')
  }
}

export function sortNewestFirst(transactions) {
  return [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

// Standing orders waiting for a decision, oldest demo run first, then in the
// shuffled queue order they were created with.
export function getApprovalQueue(transactions) {
  return transactions
    .filter((tx) => tx.requiresApproval && tx.status === 'PENDING')
    .sort((a, b) => (a.demoRun ?? 0) - (b.demoRun ?? 0) || (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
}

// History filter tabs. "Flagged" deliberately includes rejected requests.
export const HISTORY_FILTERS = {
  ALL: { label: 'All', test: () => true },
  APPROVED: { label: 'Approved', test: (tx) => tx.status === 'APPROVED' },
  PENDING: { label: 'Pending', test: (tx) => tx.status === 'PENDING' },
  FLAGGED: { label: 'Flagged', test: (tx) => tx.status === 'FLAGGED' || tx.status === 'REJECTED' },
}

export function getLedgerStats(transactions) {
  return {
    total: transactions.length,
    approved: transactions.filter(HISTORY_FILTERS.APPROVED.test).length,
    pending: transactions.filter(HISTORY_FILTERS.PENDING.test).length,
    flagged: transactions.filter(HISTORY_FILTERS.FLAGGED.test).length,
    awaitingApproval: getApprovalQueue(transactions).length,
  }
}

// Stores the engine analysis and, when given, the combined assessment
// (requestAssessment.js). `riskScore` stays the engine's score; `riskLevel`
// is the level decisions are gated on.
export function saveAnalysis(userId, ledger, txId, analysis, assessment = null) {
  return updateTransaction(userId, ledger, txId, (tx) => {
    assertAwaitingDecision(tx)
    return {
      analysis,
      ...(assessment ? { assessment } : {}),
      riskScore: analysis.score,
      riskLevel: assessment?.combined.level ?? analysis.riskLevel,
    }
  })
}

export function approveTransaction(userId, ledger, txId, { acknowledgedWarnings = false } = {}) {
  return updateTransaction(userId, ledger, txId, (tx) => {
    assertAwaitingDecision(tx)
    if (!tx.analysis) throw new TransactionError('Run the risk assessment before approving.')
    const level = decisionLevel(tx)
    if (level === 'HIGH') {
      throw new TransactionError("High-risk transactions can't be approved without additional information.")
    }
    if (level === 'MEDIUM' && !acknowledgedWarnings) {
      throw new TransactionError('Confirm you have checked the warning indicators before approving.')
    }

    const at = new Date().toISOString()
    return {
      status: 'APPROVED',
      requiresApproval: false,
      decision: { action: 'APPROVED', at, acknowledgedWarnings },
      proof: { reference: `FA-${createId().slice(0, 10).toUpperCase()}`, issuedAt: at },
    }
  })
}

export function requestMoreInformation(userId, ledger, txId, { items, note }) {
  if (!items?.length) throw new TransactionError('Select at least one piece of information to request.')

  return updateTransaction(userId, ledger, txId, (tx) => {
    assertAwaitingDecision(tx)
    if (!tx.analysis) throw new TransactionError('Run the risk assessment first.')
    return {
      status: 'FLAGGED',
      requiresApproval: false,
      decision: { action: 'INFO_REQUESTED', at: new Date().toISOString(), items, note: note.trim() },
    }
  })
}

export function rejectTransaction(userId, ledger, txId) {
  return updateTransaction(userId, ledger, txId, (tx) => {
    assertAwaitingDecision(tx)
    return {
      status: 'REJECTED',
      requiresApproval: false,
      decision: { action: 'REJECTED', at: new Date().toISOString() },
    }
  })
}

// Appends a fresh set of the three demo requests. Only allowed once the
// current queue has been fully decided.
export function replayDemoRequests(user, ledger) {
  if (getApprovalQueue(ledger.transactions).length > 0) {
    throw new TransactionError('Finish the current approvals before starting a new demo run.')
  }

  const run = (ledger.demoRun ?? 1) + 1
  return saveLedger(user.id, {
    transactions: [...ledger.transactions, ...createDemoRequests(user, { run })],
    demoRun: run,
  })
}

// Restores the seed history and first demo run. Account and bank details are
// kept because they live in the users store, not the ledger.
export function resetLedger(user) {
  return saveLedger(user.id, createInitialLedger(user))
}
