import { storage } from '../storage/storage.js'
import { normalizeAccountNumber } from '../data/banks.js'
import { createId, hashPassword } from '../utils/ids.js'
import { normalizeEmail } from './validation.js'

// Browser-only account store. Users live under `fraudauth:v1:users`, keyed
// by normalised email; the active session under `fraudauth:v1:session`.

const USERS_KEY = 'users'
const SESSION_KEY = 'session'

export class AuthError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'AuthError'
    this.field = field
  }
}

function readUsers() {
  return storage.read(USERS_KEY, {})
}

// Never hand password material to the UI.
function toPublicUser(record) {
  const { passwordHash, salt, ...user } = record
  return user
}

function startSession(record) {
  storage.write(SESSION_KEY, { userId: record.id, email: record.email, startedAt: new Date().toISOString() })
}

export function emailIsRegistered(email) {
  return Boolean(readUsers()[normalizeEmail(email)])
}

export function hasAnyAccount() {
  return Object.keys(readUsers()).length > 0
}

export async function createAccount({ fullName, email, password, bank }) {
  const key = normalizeEmail(email)
  const users = readUsers()
  if (users[key]) throw new AuthError('An account with this email already exists. Log in instead.', 'email')

  const salt = createId()
  const record = {
    id: createId('usr'),
    fullName: fullName.trim(),
    email: key,
    passwordHash: await hashPassword(password, salt),
    salt,
    bank: {
      code: bank.code,
      accountHolder: bank.accountHolder.trim(),
      accountNumber: normalizeAccountNumber(bank.accountNumber),
    },
    createdAt: new Date().toISOString(),
  }

  storage.write(USERS_KEY, { ...users, [key]: record })
  startSession(record)
  return toPublicUser(record)
}

export async function logIn({ email, password }) {
  const record = readUsers()[normalizeEmail(email)]
  const failure = new AuthError("That email and password don't match an account. Check them and try again.")

  if (!record || (await hashPassword(password, record.salt)) !== record.passwordHash) throw failure

  startSession(record)
  return toPublicUser(record)
}

export function logOut() {
  storage.remove(SESSION_KEY)
}

// Restores the signed-in user on page load, dropping a stale session whose
// account no longer exists.
export function getSessionUser() {
  const session = storage.read(SESSION_KEY)
  if (!session) return null

  const record = readUsers()[session.email]
  if (!record || record.id !== session.userId) {
    storage.remove(SESSION_KEY)
    return null
  }
  return toPublicUser(record)
}
