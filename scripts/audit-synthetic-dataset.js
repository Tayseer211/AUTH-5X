#!/usr/bin/env node
// Audits the synthetic dataset for label shortcuts: class and scenario
// distribution, schema validity, riskSignalCount by class, missing values by
// class, feature values that reveal fraud on their own, and the strongest
// single columns. Exits non-zero if any shortcut or invalid record is found.
//
//   npm run data:audit
//   npm run data:audit -- --data data/synthetic/generated

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { auditDataset } from '../src/fraud/ml/audit.js'
import { generateDataset } from '../src/fraud/synthetic/generator.js'

async function loadRecords(argv) {
  const index = argv.indexOf('--data')
  if (index === -1) return { records: generateDataset().records, source: 'default config (in memory)' }
  const dir = path.resolve(argv[index + 1])
  const text = await readFile(path.join(dir, 'standing-orders.jsonl'), 'utf8')
  return { records: text.split('\n').filter(Boolean).map((line) => JSON.parse(line)), source: dir }
}

const pct = (value) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`)

async function main() {
  const { records, source } = await loadRecords(process.argv.slice(2))
  const audit = auditDataset(records)

  console.log(`Dataset: ${source} — ${audit.records} records, ${audit.fraud} fraud (${pct(audit.fraudRate)}), ${audit.invalidRecords} invalid`)
  console.log('\nBy class:')
  for (const [name, entry] of Object.entries(audit.byClass)) console.log(`  ${name.padEnd(14)} ${String(entry.records).padStart(5)}  fraud ${entry.fraud}`)
  console.log('\nBy scenario:')
  for (const [name, entry] of Object.entries(audit.byScenario)) console.log(`  ${name.padEnd(28)} ${entry.riskClass.padEnd(14)} ${String(entry.records).padStart(5)}  fraud ${entry.fraud}`)
  console.log('\nriskSignalCount by class (min–max, histogram):')
  for (const [name, entry] of Object.entries(audit.riskSignalCount)) console.log(`  ${name.padEnd(14)} ${entry.min}–${entry.max}  ${JSON.stringify(entry.histogram)}`)
  console.log('\nMissing values by class:')
  for (const [name, shares] of Object.entries(audit.missingByClass)) console.log(`  ${name.padEnd(34)} ${Object.entries(shares).map(([riskClass, value]) => `${riskClass} ${pct(value)}`).join('  ')}`)
  console.log('\nStrongest single columns (AUC alone):')
  for (const row of audit.singleColumnAuc.slice(0, 12)) console.log(`  ${row.column.padEnd(44)} ${row.auc}`)
  console.log(`\nShortcuts (value seen ≥ ${audit.thresholds.minCount}× and ≥ ${pct(audit.thresholds.purity)} fraud): ${audit.shortcuts.length}`)
  for (const row of audit.shortcuts) console.log(`  ${row.feature}=${row.value}: ${row.fraud}/${row.n} fraud`)

  if (audit.shortcuts.length || audit.invalidRecords) process.exitCode = 1
}

main().catch((error) => {
  console.error(error.stack ?? error.message)
  process.exitCode = 1
})
