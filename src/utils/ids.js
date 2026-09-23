// Random IDs and password hashing for the simulated, browser-only account
// store. This is demo-grade: good enough to avoid storing plain-text
// passwords in localStorage, not a substitute for server-side auth.

export function createId(prefix = '') {
  const bytes = new Uint8Array(8)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return prefix ? `${prefix}_${hex}` : hex
}

// SHA-256 of `salt:password` via WebCrypto. The FNV-style fallback only runs
// in insecure contexts where crypto.subtle is missing; it must stay
// byte-for-byte compatible so existing saved accounts can still log in.
export async function hashPassword(password, salt) {
  const input = `${salt}:${password}`

  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(input)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  let h1 = 2166136261
  let h2 = 16777619
  for (let round = 0; round < 1000; round += 1) {
    for (let i = 0; i < input.length; i += 1) {
      const code = input.charCodeAt(i)
      h1 = Math.imul(h1 ^ code, 16777619) >>> 0
      h2 = Math.imul(h2 ^ (code + round), 2246822519) >>> 0
    }
  }
  return `fb-${h1.toString(16)}${h2.toString(16)}`
}
