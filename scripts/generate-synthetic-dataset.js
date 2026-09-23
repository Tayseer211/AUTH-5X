#!/usr/bin/env node
// Generates the synthetic standing-order dataset into data/synthetic/generated
// (or --out). See data/synthetic/DATA_CARD.md.
//
//   npm run data:generate
//   npm run data:generate -- --users 500 --orders 10000 --seed demo-1 --fraud-rate 0.1

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CONFIG, generateDataset } from '../src/fraud/synthetic/generator.js'
import { SCHEMA, toCsv, validateRecord } from '../src/fraud/synthetic/schema.js'
import { SCENARIOS } from '../src/fraud/synthetic/scenarios.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT = path.join(ROOT, 'data', 'synthetic', 'generated')

const HELP = `Generate the fraud.auth synthetic standing-order dataset.

Options (defaults in brackets):
  --users <n>                   synthetic users [${DEFAULT_CONFIG.users}]
  --orders <n>                  standing-order records [${DEFAULT_CONFIG.standingOrders}]
  --seed <text>                 random seed; same seed = same dataset [${DEFAULT_CONFIG.seed}]
  --fraud-rate <0-1>            share of the "fraudulent" class; other classes rescale
  --mix <class=share,...>       class mix, e.g. legit_normal=0.6,legit_unusual=0.2,suspicious=0.12,fraudulent=0.08
  --suspicious-fraud-share <0-1>  chance a suspicious record is labelled fraud [${DEFAULT_CONFIG.suspiciousFraudShare}]
  --history-months <n>          months of history per user [${DEFAULT_CONFIG.historyMonths}]
  --reference-date <iso>        end of history / start of requests [${DEFAULT_CONFIG.referenceDate}]
  --out <dir>                   output directory [data/synthetic/generated]
  --with-history                also write each user's ledger and the app-shaped requests
  --help                        show this help
`

function parseArgs(argv) {
  const options = {}
  const config = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = () => {
      const next = argv[++i]
      if (next === undefined) throw new Error(`${arg} needs a value`)
      return next
    }
    const number = () => {
      const parsed = Number(value())
      if (!Number.isFinite(parsed)) throw new Error(`${arg} must be a number`)
      return parsed
    }
    switch (arg) {
      case '--users': config.users = number(); break
      case '--orders': config.standingOrders = number(); break
      case '--seed': config.seed = value(); break
      case '--fraud-rate': config.fraudRate = number(); break
      case '--suspicious-fraud-share': config.suspiciousFraudShare = number(); break
      case '--history-months': config.historyMonths = number(); break
      case '--reference-date': config.referenceDate = value(); break
      case '--mix':
        config.classMix = Object.fromEntries(
          value()
            .split(',')
            .map((pair) => pair.split('='))
            .map(([key, share]) => [key.trim(), Number(share)]),
        )
        break
      case '--out': options.out = path.resolve(value()); break
      case '--with-history': options.withHistory = true; break
      case '--help': case '-h': options.help = true; break
      default: throw new Error(`Unknown option ${arg} (see --help)`)
    }
  }
  return { options, config }
}

const jsonl = (items) => items.map((item) => JSON.stringify(item)).join('\n') + '\n'

async function main() {
  const { options, config } = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(HELP)
    return
  }
  const out = options.out ?? DEFAULT_OUT

  const started = Date.now()
  const dataset = generateDataset(config)

  const invalid = dataset.records.map((record) => [record.standingOrderId, validateRecord(record)]).filter(([, problems]) => problems.length)
  if (invalid.length) {
    for (const [id, problems] of invalid.slice(0, 10)) console.error(`${id}: ${problems.join('; ')}`)
    throw new Error(`${invalid.length} generated records failed validation; nothing written.`)
  }

  const files = {
    'standing-orders.jsonl': jsonl(dataset.records),
    'standing-orders.csv': toCsv(dataset.records),
    'users.json': JSON.stringify(dataset.users, null, 2) + '\n',
    'schema.json':
      JSON.stringify({ ...SCHEMA, scenarios: SCENARIOS.map(({ id, riskClass, description }) => ({ id, riskClass, description })) }, null, 2) + '\n',
  }
  if (options.withHistory) {
    files['history.jsonl'] = jsonl(Object.entries(dataset.histories).flatMap(([userId, history]) => history.map((tx) => ({ userId, ...tx }))))
    files['requests.jsonl'] = jsonl(dataset.requests)
  }
  files['manifest.json'] =
    JSON.stringify(
      {
        dataset: 'fraud.auth synthetic standing-order requests',
        synthetic: true,
        notice:
          'Entirely synthetic. Fictional users, payees and accounts generated for prototyping and model development. Not real banking or customer data, and not an estimate of real-world fraud prevalence. See data/synthetic/DATA_CARD.md.',
        generatorVersion: dataset.generatorVersion,
        config: dataset.config,
        summary: dataset.summary,
        files: Object.keys(files),
      },
      null,
      2,
    ) + '\n'

  await mkdir(out, { recursive: true })
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(out, name), content, 'utf8')

  const { summary } = dataset
  console.log(`Generated ${summary.records} standing orders for ${summary.users} users in ${Date.now() - started} ms (seed "${dataset.config.seed}").`)
  console.log(`  by class: ${Object.entries(summary.byRiskClass).map(([name, count]) => `${name} ${count}`).join(', ')}`)
  console.log(`  labelled fraud: ${summary.fraudLabelled} (${(summary.fraudRate * 100).toFixed(1)}%), of which ${summary.suspiciousLabelledFraud} from the suspicious class`)
  console.log(`  written to ${path.relative(ROOT, out) || '.'}: ${Object.keys(files).join(', ')}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
