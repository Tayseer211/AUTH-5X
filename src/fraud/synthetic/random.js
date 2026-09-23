// Seeded pseudo-random numbers for the synthetic dataset. The same seed always
// produces the same sequence, on any machine, so a dataset can be regenerated
// exactly from its seed. Not for anything security-related.

// 32-bit FNV-1a hash of the seed, finished with a murmur3 mix.
function hashSeed(seed) {
  const text = String(seed)
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export function createRng(seed) {
  let state = hashSeed(seed)

  // mulberry32
  function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng = {
    seed: String(seed),
    next,
    float: (min = 0, max = 1) => min + (max - min) * next(),
    // Inclusive of both ends.
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    // `entries` is `{ value: weight }` or `[[value, weight], ...]`.
    weighted(entries) {
      const list = Array.isArray(entries) ? entries : Object.entries(entries)
      const total = list.reduce((sum, [, weight]) => sum + weight, 0)
      let remaining = next() * total
      for (const [value, weight] of list) {
        remaining -= weight
        if (remaining < 0) return value
      }
      return list[list.length - 1][0]
    },
    normal(mean = 0, sd = 1) {
      const u = 1 - next()
      const v = next()
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    // Log-normal with the given median.
    logNormal: (median, sigma) => median * Math.exp(rng.normal(0, sigma)),
    shuffle(items) {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    },
    sample: (items, count) => rng.shuffle(items).slice(0, count),
    digits: (length) => Array.from({ length }, () => Math.floor(next() * 10)).join(''),
    hex: (length) => Array.from({ length }, () => Math.floor(next() * 16).toString(16)).join(''),
    // An independent stream, so one part of the dataset (a user, a record)
    // does not shift when another part changes.
    fork: (label) => createRng(`${seed}/${label}`),
  }
  return rng
}
