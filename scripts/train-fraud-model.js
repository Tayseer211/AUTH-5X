#!/usr/bin/env node
// Trains and evaluates the Stage 3 fraud model on the synthetic dataset and
// writes the model artifact and an evaluation report. See models/MODEL_CARD.md.
//
//   npm run model:train
//   npm run model:train -- --data data/synthetic/generated

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDemoRequests } from '../src/data/demoCases.js'
import { createSeedTransactions } from '../src/data/seedTransactions.js'
import { analyseStandingOrder } from '../src/fraud/engine.js'
import { auditDataset } from '../src/fraud/ml/audit.js'
import { evaluateModel } from '../src/fraud/ml/evaluate.js'
import { predictFraudForRequest } from '../src/fraud/ml/predict.js'
import { deriveUserProfile } from '../src/fraud/profile.js'
import { EXCLUDED_FIELDS, MODEL_FEATURES } from '../src/fraud/ml/featureSpec.js'
import { trainFraudModel } from '../src/fraud/ml/train.js'
import { GENERATOR_VERSION, generateDataset } from '../src/fraud/synthetic/generator.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT = path.join(ROOT, 'models')

// A second, independent synthetic dataset (new seed → new users and records),
// used only to evaluate. Larger than the test split, so per-scenario numbers
// rest on more than a handful of records.
const HOLDOUT_CONFIG = { seed: 'fraud-auth-stage3-holdout', users: 500, standingOrders: 5000 }

const HELP = `Train and evaluate the fraud.auth Stage 3 model.

Options:
  --data <dir>     read standing-orders.jsonl + manifest.json from <dir>
                   (default: regenerate the default dataset in memory,
                   identical to \`npm run data:generate\`)
  --out <dir>      where to write fraud-model.json and EVALUATION.md [models/]
  --no-holdout     skip the fresh-seed hold-out evaluation
  --help           show this help
`

function parseArgs(argv) {
  const options = { holdout: true }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = () => {
      const next = argv[++i]
      if (next === undefined) throw new Error(`${arg} needs a value`)
      return next
    }
    switch (arg) {
      case '--data': options.data = path.resolve(value()); break
      case '--out': options.out = path.resolve(value()); break
      case '--no-holdout': options.holdout = false; break
      case '--help': case '-h': options.help = true; break
      default: throw new Error(`Unknown option ${arg} (see --help)`)
    }
  }
  return options
}

const jsonl = (items) => items.map((item) => JSON.stringify(item)).join('\n') + '\n'
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

async function loadDataset(dir) {
  if (!dir) {
    const dataset = generateDataset()
    return {
      records: dataset.records,
      info: {
        source: 'generateDataset() default config (same as npm run data:generate)',
        generatorVersion: dataset.generatorVersion,
        seed: dataset.config.seed,
        records: dataset.records.length,
        users: dataset.config.users,
        fraudRate: dataset.summary.fraudRate,
        sha256: sha256(jsonl(dataset.records)),
      },
    }
  }
  const text = await readFile(path.join(dir, 'standing-orders.jsonl'), 'utf8')
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
  const records = text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  return {
    records,
    info: {
      source: path.relative(ROOT, dir).replaceAll('\\', '/'),
      generatorVersion: manifest.generatorVersion,
      seed: manifest.config.seed,
      records: records.length,
      users: manifest.config.users,
      fraudRate: manifest.summary.fraudRate,
      sha256: sha256(text),
    },
  }
}

// The app's three demo requests, scored for information only. They are never
// trained on, and their rule-engine scores (100 / 69 / 8) are not targets.
// A fixed "now" keeps the report reproducible.
function scoreDemoRequests(model) {
  const now = new Date('2026-09-23T08:00:00Z')
  const history = createSeedTransactions(now)
  const profile = deriveUserProfile(history)
  return createDemoRequests({ bank: { code: 'MCB' } }, { now })
    .sort((a, b) => a.verificationCase.localeCompare(b.verificationCase))
    .map((request) => {
      const prediction = predictFraudForRequest(model, request, { history, profile })
      return {
        demoCase: request.verificationCase,
        ruleEngineScore: analyseStandingOrder(request, profile).score,
        fraudProbability: Math.round(prediction.fraudProbability * 1e4) / 1e4,
        warnings: prediction.warnings,
      }
    })
}

function summariseAudit(audit) {
  return {
    shortcuts: audit.shortcuts,
    thresholds: audit.thresholds,
    riskSignalCount: Object.fromEntries(Object.entries(audit.riskSignalCount).map(([name, entry]) => [name, { min: entry.min, max: entry.max }])),
    missingByClass: Object.fromEntries(['payeeCategory', 'referenceCategory', 'beneficiaryAddedMinutesBefore', 'recipientAccountPreviouslyUsed'].map((name) => [name, audit.missingByClass[name]])),
    strongestValues: audit.valueTable.filter((row) => row.n >= audit.thresholds.minCount).sort((a, b) => b.fraudShare - a.fraudShare || b.n - a.n).slice(0, 8),
    strongestSingleColumns: audit.singleColumnAuc.slice(0, 8),
  }
}

// ---- Report ---------------------------------------------------------------

const pct = (value) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`)
const num = (value, places = 3) => (value == null ? '—' : value.toFixed(places))
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
const frac = (a, b) => (b === 0 ? '—' : `${a}/${b} (${pct(a / b)})`)

function operatingRow(label, m) {
  const c = m.confusion
  return [label, c.truePositives, c.falsePositives, c.falseNegatives, c.trueNegatives, pct(m.precision), pct(m.recall), num(m.f1), pct(m.accuracy)]
}

function scenarioTable(byScenario) {
  return table(
    ['Scenario', 'Class', 'n', 'Fraud', 'Mean p', 'ML: fraud caught', 'ML: legit flagged', 'Rules (tuned): fraud caught', 'Rules (tuned): legit flagged', 'Rules (review band): legit flagged'],
    byScenario.map((s) => [
      `\`${s.scenario}\``,
      s.riskClass,
      s.records,
      s.fraud,
      num(s.meanProbability),
      frac(s.ml.fraudCaught, s.fraud),
      frac(s.ml.legitFlagged, s.records - s.fraud),
      frac(s.rulesTuned.fraudCaught, s.fraud),
      frac(s.rulesTuned.legitFlagged, s.records - s.fraud),
      frac(s.rulesReviewBand.legitFlagged, s.records - s.fraud),
    ]),
  )
}

function evaluationSection(title, evaluation, threshold) {
  const { ml, ruleEngine } = evaluation
  const headers = ['Scorer', 'TP', 'FP', 'FN', 'TN', 'Precision', 'Recall', 'F1', 'Accuracy']
  return `## ${title}

${evaluation.records} records: ${evaluation.fraud} fraud, ${evaluation.legitimate} legitimate.

Threshold-free: ML ROC-AUC **${num(ml.rocAuc)}**, average precision ${num(ml.averagePrecision)}, log loss ${num(ml.logLoss)}, Brier ${num(ml.brierScore)}.
Rule engine (100 − score as a fraud score): ROC-AUC ${num(ruleEngine.rocAuc)}, average precision ${num(ruleEngine.averagePrecision)}.

${table(headers, [
  operatingRow(`ML, candidate threshold ${threshold}`, ml.atCandidateThreshold),
  operatingRow('ML, threshold 0.5', ml.atHalf),
  ...Object.values(ruleEngine.operatingPoints).map((point) => operatingRow(point.label, point)),
])}

### Threshold analysis (ML)

${table(['Threshold', 'Flagged', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'F1', 'False-positive rate'], ml.thresholds.map((m) => [m.threshold, m.flagged, m.confusion.truePositives, m.confusion.falsePositives, m.confusion.falseNegatives, pct(m.precision), pct(m.recall), num(m.f1), pct(m.falsePositiveRate)]))}

### By scenario

ML flags at the candidate threshold (${threshold}); "rules (tuned)" uses the validation-tuned rule cutoff; "review band" is the rule engine's MEDIUM-or-HIGH band. Scenarios with fewer than ~10 records here are too small to judge.

${scenarioTable(evaluation.byScenario)}
`
}

function auditSection(audit) {
  return `## Dataset audit (label shortcuts)

Values of model inputs seen at least ${audit.thresholds.minCount} times that are fraud at least ${pct(audit.thresholds.purity)} of the time: **${audit.shortcuts.length}**${audit.shortcuts.length ? ` (${audit.shortcuts.map((row) => `\`${row.feature}=${row.value}\` ${row.fraud}/${row.n}`).join(', ')})` : ''}.

${table(['riskSignalCount', 'Min', 'Max'], Object.entries(audit.riskSignalCount).map(([name, entry]) => [name, entry.min, entry.max]))}

Missing values by class:

${table(['Feature', 'legit_normal', 'legit_unusual', 'suspicious', 'fraudulent'], Object.entries(audit.missingByClass).map(([name, shares]) => [`\`${name}\``, pct(shares.legit_normal), pct(shares.legit_unusual), pct(shares.suspicious), pct(shares.fraudulent)]))}

Most fraud-associated values (n ≥ ${audit.thresholds.minCount}):

${table(['Value', 'Fraud', 'legit_normal', 'legit_unusual'], audit.strongestValues.map((row) => [`\`${row.feature}=${row.value}\``, `${row.fraud}/${row.n} (${pct(row.fraudShare)})`, row.legitNormal, row.legitUnusual]))}
`
}

function demoSection(demo) {
  return `## Demo requests (information only)

${demo.note}

${table(['Demo case', 'Rule-engine score', 'ML fraud probability', 'Warnings'], demo.predictions.map((row) => [row.demoCase, row.ruleEngineScore, num(row.fraudProbability, 4), row.warnings.length ? row.warnings.join('; ') : 'none']))}
`
}

function renderReport(artifact) {
  const { dataset, training, thresholds, evaluation, diagnostics } = artifact
  const sizes = training.sizes
  return `# Fraud model evaluation — ${artifact.modelVersion}

> Generated by \`npm run model:train\`. **Synthetic data only.** These numbers describe
> how well a model recovers the patterns written into the Stage 2 generator. They are
> not, and must not be quoted as, real-world fraud-detection performance.
> See [MODEL_CARD.md](MODEL_CARD.md).

- Model: L2-regularised logistic regression, ${artifact.model.preprocessing.columns.length} encoded columns from ${artifact.features.length} features
- Dataset: ${dataset.records} records, ${dataset.users} users, generator ${dataset.generatorVersion}, seed \`${dataset.seed}\`, sha256 \`${dataset.sha256.slice(0, 16)}…\`
- Split: ${training.split}-level, stratified on isFraud, seed \`${training.seed}\`
- Selected L2: ${training.selectedL2} (lowest validation log loss), ${training.iterations} Newton iterations, converged: ${training.converged}

${table(['Split', 'Records', 'Fraud', 'Users'], Object.entries(sizes).map(([name, s]) => [name, s.records, `${s.fraud} (${pct(s.fraud / s.records)})`, s.users]))}

### L2 search (validation)

${table(['L2', 'ROC-AUC', 'Avg precision', 'Log loss'], training.l2Search.map((row) => [row.l2, num(row.validation.rocAuc), num(row.validation.averagePrecision), num(row.validation.logLoss, 4)]))}

### Thresholds (chosen on validation)

- Candidate: **${thresholds.candidate.threshold}** (${thresholds.candidate.rule}; validation F1 ${num(thresholds.candidate.validationF1)})
- Cost-sensitive example (missed fraud = ${thresholds.costSensitive.falseNegativeCost}× a false alarm): ${thresholds.costSensitive.threshold}
- ${thresholds.ruleEngineTunedCutoff.label} (validation F1 ${num(thresholds.ruleEngineTunedCutoff.validationF1)})

${evaluationSection('Test set (held-out users)', evaluation.test, thresholds.candidate.threshold)}
${evaluation.recordSplitComparison ? `## Split comparison

Same pipeline with a record-level split (records shuffled independently, users shared between splits):
test ROC-AUC ${num(evaluation.recordSplitComparison.rocAuc)}, F1 at its own candidate threshold (${evaluation.recordSplitComparison.threshold}) ${num(evaluation.recordSplitComparison.f1)},
versus ${num(evaluation.test.ml.rocAuc)} / ${num(evaluation.test.ml.atCandidateThreshold.f1)} for the user-level split.
` : ''}
${(evaluation.ablations ?? []).map((a) => `## Ablation: \`${a.id}\`

${a.note} Test ROC-AUC ${num(a.rocAuc)}; at its own candidate threshold (${a.threshold}): precision ${pct(a.precision)}, recall ${pct(a.recall)}, F1 ${num(a.f1)}.
`).join('\n')}
${evaluation.freshSeedHoldout ? evaluationSection(`Fresh-seed hold-out (${evaluation.freshSeedHoldout.config.standingOrders} records, ${evaluation.freshSeedHoldout.config.users} new users, seed \`${evaluation.freshSeedHoldout.config.seed}\`)`, evaluation.freshSeedHoldout, thresholds.candidate.threshold) : ''}
${artifact.demoRequests ? demoSection(artifact.demoRequests) : ''}
${artifact.datasetAudit ? auditSection(artifact.datasetAudit) : ''}
## Diagnostics

Largest standardised weights (positive = pushes towards fraud):

${table(['Column', 'Weight'], diagnostics.largestWeights.map((row) => [`\`${row.column}\``, row.weight]))}

Strongest single columns on the training set (ROC-AUC of that column alone; 0.5 = no signal, near 0 or 1 alone would suggest leakage):

${table(['Column', 'AUC alone'], diagnostics.strongestSingleColumns.map((row) => [`\`${row.column}\``, row.auc]))}

## Excluded fields

${table(['Field', 'Why it is not a model input'], Object.entries(EXCLUDED_FIELDS).map(([name, reason]) => [`\`${name}\``, reason]))}
`
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(HELP)
    return
  }
  const out = options.out ?? DEFAULT_OUT
  const started = Date.now()

  const { records, info } = await loadDataset(options.data)
  if (info.generatorVersion !== GENERATOR_VERSION) console.warn(`Warning: dataset generator ${info.generatorVersion} differs from current ${GENERATOR_VERSION}`)

  const { artifact, model } = trainFraudModel(records, { dataset: info })
  const threshold = artifact.thresholds.candidate.threshold
  artifact.datasetAudit = summariseAudit(auditDataset(records))
  artifact.demoRequests = {
    note: 'The app\'s three demo requests, scored for information only. Never trained on; their rule-engine scores are not targets.',
    predictions: scoreDemoRequests(model),
  }

  // Record-level split, for comparison only.
  const recordLevel = trainFraudModel(records, { dataset: info, split: 'record' }).artifact
  artifact.evaluation.recordSplitComparison = {
    note: 'Same pipeline with a record-level split. Reported for comparison; the shipped model uses the user-level split.',
    rocAuc: recordLevel.evaluation.test.ml.rocAuc,
    threshold: recordLevel.thresholds.candidate.threshold,
    f1: recordLevel.evaluation.test.ml.atCandidateThreshold.f1,
    precision: recordLevel.evaluation.test.ml.atCandidateThreshold.precision,
    recall: recordLevel.evaluation.test.ml.atCandidateThreshold.recall,
  }

  // Ablation: how much rests on the hand-built riskSignalCount summary.
  const ablated = trainFraudModel(records, { dataset: info, features: MODEL_FEATURES.filter((feature) => feature.name !== 'riskSignalCount') }).artifact
  artifact.evaluation.ablations = [
    {
      id: 'without-riskSignalCount',
      note: 'Same pipeline and split without the riskSignalCount feature. Comparison only.',
      rocAuc: ablated.evaluation.test.ml.rocAuc,
      threshold: ablated.thresholds.candidate.threshold,
      f1: ablated.evaluation.test.ml.atCandidateThreshold.f1,
      precision: ablated.evaluation.test.ml.atCandidateThreshold.precision,
      recall: ablated.evaluation.test.ml.atCandidateThreshold.recall,
    },
  ]

  if (options.holdout) {
    const holdout = generateDataset(HOLDOUT_CONFIG)
    artifact.evaluation.freshSeedHoldout = {
      config: HOLDOUT_CONFIG,
      ...evaluateModel(model, holdout.records, { threshold, ruleCutoff: artifact.thresholds.ruleEngineTunedCutoff.riskAtLeast }),
    }
  }

  await mkdir(out, { recursive: true })
  await writeFile(path.join(out, 'fraud-model.json'), JSON.stringify(artifact, null, 2) + '\n', 'utf8')
  await writeFile(path.join(out, 'EVALUATION.md'), renderReport(artifact), 'utf8')

  const test = artifact.evaluation.test
  const m = test.ml.atCandidateThreshold
  console.log(`Trained ${artifact.modelVersion} on ${artifact.training.sizes.train.records} records in ${Date.now() - started} ms (L2 ${artifact.training.selectedL2}, ${artifact.model.preprocessing.columns.length} columns).`)
  console.log(`  test (${test.records} records, ${test.fraud} fraud, held-out users): ROC-AUC ${test.ml.rocAuc}, threshold ${threshold}: precision ${m.precision}, recall ${m.recall}, F1 ${m.f1}`)
  console.log(`  rule engine on the same records: ROC-AUC ${test.ruleEngine.rocAuc}, tuned cutoff F1 ${test.ruleEngine.operatingPoints.tuned.f1}`)
  if (artifact.evaluation.freshSeedHoldout) console.log(`  fresh-seed hold-out: ROC-AUC ${artifact.evaluation.freshSeedHoldout.ml.rocAuc}, F1 ${artifact.evaluation.freshSeedHoldout.ml.atCandidateThreshold.f1}`)
  console.log(`  written to ${path.relative(ROOT, out) || '.'}: fraud-model.json, EVALUATION.md`)
}

main().catch((error) => {
  console.error(error.stack ?? error.message)
  process.exitCode = 1
})
