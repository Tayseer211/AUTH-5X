import { createRng } from '../synthetic/random.js'

// Reproducible train / validation / test splits, stratified on isFraud.
//
// userSplit keeps every record of a user in one split, so the test set
// measures how the model does on customers it has never seen — it cannot
// score well by recognising a user's baseline values from training. This is
// the split the model is evaluated on. recordSplit (records shuffled
// independently) is kept for comparison.

export const SPLITS = ['train', 'validation', 'test']
export const DEFAULT_FRACTIONS = { train: 0.6, validation: 0.2, test: 0.2 }

const isFraud = (record) => record.labels.isFraud === true

function emptySplits() {
  return Object.fromEntries(SPLITS.map((split) => [split, []]))
}

// Fractions as a pattern of ten slots, e.g. 0.6/0.2/0.2 → 6 train, 2
// validation, 2 test.
function slotPattern(fractions) {
  const pattern = SPLITS.flatMap((split) => Array(Math.round(fractions[split] * 10)).fill(split))
  if (pattern.length !== 10) throw new Error('Split fractions must be multiples of 0.1 summing to 1')
  return pattern
}

// Users are shuffled with the seed and ordered by how many fraud records
// they have (most first). Consecutive blocks of ten users are then dealt out
// by a shuffled slot pattern, so each split gets its share of fraud-heavy,
// light and fraud-free users (stratified group split).
export function userSplit(records, { seed, fractions = DEFAULT_FRACTIONS } = {}) {
  const rng = createRng(`${seed}/user-split`)
  const pattern = slotPattern(fractions)
  const byUser = new Map()
  for (const record of records) {
    if (!byUser.has(record.userId)) byUser.set(record.userId, [])
    byUser.get(record.userId).push(record)
  }
  const users = rng
    .shuffle([...byUser.keys()].sort())
    .map((userId, order) => ({ order, records: byUser.get(userId), fraud: byUser.get(userId).filter(isFraud).length }))
    .sort((a, b) => b.fraud - a.fraud || a.order - b.order)

  const assigned = new Map()
  for (let start = 0; start < users.length; start += pattern.length) {
    const slots = rng.shuffle(pattern)
    users.slice(start, start + pattern.length).forEach((user, i) => {
      for (const record of user.records) assigned.set(record, slots[i])
    })
  }
  // Keep dataset order within each split.
  const splits = emptySplits()
  for (const record of records) splits[assigned.get(record)].push(record)
  return splits
}

// Fraud and non-fraud records are shuffled separately and cut by `fractions`.
export function recordSplit(records, { seed, fractions = DEFAULT_FRACTIONS } = {}) {
  const rng = createRng(`${seed}/record-split`)
  const splits = emptySplits()
  for (const group of [records.filter(isFraud), records.filter((record) => !isFraud(record))]) {
    const shuffled = rng.shuffle(group)
    const trainEnd = Math.round(shuffled.length * fractions.train)
    const validationEnd = trainEnd + Math.round(shuffled.length * fractions.validation)
    splits.train.push(...shuffled.slice(0, trainEnd))
    splits.validation.push(...shuffled.slice(trainEnd, validationEnd))
    splits.test.push(...shuffled.slice(validationEnd))
  }
  // Restore dataset order within each split.
  const position = new Map(records.map((record, i) => [record, i]))
  for (const split of SPLITS) splits[split].sort((a, b) => position.get(a) - position.get(b))
  return splits
}
