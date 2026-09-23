// Namespaced JSON storage on top of localStorage. Every key is prefixed with
// `fraudauth:v1:` — the same schema the original prototype used, so accounts
// and ledgers saved by the prototype keep working here. If localStorage is
// unavailable (private mode, blocked site data) it falls back to an in-memory
// Map so the app still runs, just without surviving a refresh.

export const STORAGE_PREFIX = 'fraudauth:v1:'

export class StorageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'StorageError'
  }
}

function probeLocalStorage() {
  try {
    const store = window.localStorage
    const probeKey = `${STORAGE_PREFIX}__probe`
    store.setItem(probeKey, '1')
    store.removeItem(probeKey)
    return store
  } catch {
    return null
  }
}

const localStore = probeLocalStorage()
const memoryStore = new Map()

export const storage = {
  isPersistent: Boolean(localStore),

  read(key, fallback = null) {
    try {
      const raw = localStore ? localStore.getItem(STORAGE_PREFIX + key) : memoryStore.get(key)
      return raw == null ? fallback : JSON.parse(raw)
    } catch {
      throw new StorageError('Saved data could not be read. It may be corrupted.')
    }
  },

  write(key, value) {
    try {
      const raw = JSON.stringify(value)
      if (localStore) localStore.setItem(STORAGE_PREFIX + key, raw)
      else memoryStore.set(key, raw)
    } catch {
      throw new StorageError('Your changes could not be saved. Check that browser storage is enabled and not full.')
    }
  },

  remove(key) {
    try {
      if (localStore) localStore.removeItem(STORAGE_PREFIX + key)
      else memoryStore.delete(key)
    } catch {
      throw new StorageError('Saved data could not be removed.')
    }
  },

  // Only removes fraud.auth keys, never anything else on the origin.
  clearAll() {
    if (!localStore) {
      memoryStore.clear()
      return
    }
    Object.keys(localStore)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => localStore.removeItem(key))
  },
}
