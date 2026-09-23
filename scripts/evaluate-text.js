#!/usr/bin/env node
// Evaluates the deterministic message classifier (src/fraud/text/classifier.js)
// on the synthetic message corpus (src/fraud/synthetic/messages.js).
//
// The classifier sees only each message's text (messageInput); the corpus
// labels are used for scoring alone. Results describe agreement with a
// synthetic corpus written for this project, not performance on real
// messages. Nothing is written to disk and nothing is tuned here.
//
//   npm run text:evaluate
//   npm run text:evaluate -- --seed other-seed
//   npm run text:evaluate -- --json

import { classificationMetrics, confusionMatrix } from '../src/fraud/ml/metrics.js'
import { MESSAGE_LABELS, generateMessageCorpus, messageInput } from '../src/fraud/synthetic/messages.js'
import { CLASSIFIER_VERSION, SIGNALS, THRESHOLDS, classifyMessage } from '../src/fraud/text/classifier.js'

function parseArgs(argv) {
  const options = { seed: undefined, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seed') options.seed = argv[(i += 1)]
    else if (argv[i] === '--json') options.json = true
    else throw new Error(`Unknown option ${argv[i]}`)
  }
  return options
}

const round = (value) => (value == null ? null : Math.round(value * 1000) / 1000)
const pct = (value) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`)

// One-vs-rest metrics for `positive` (a label or a set of labels).
function binary(actual, predicted, positive) {
  const isPositive = (label) => [].concat(positive).includes(label)
  const confusion = confusionMatrix(actual.map(isPositive), predicted.map((label) => (isPositive(label) ? 1 : 0)), 1)
  const { accuracy, precision, recall, f1 } = classificationMetrics(confusion)
  return { support: actual.filter(isPositive).length, precision: round(precision), recall: round(recall), f1: round(f1), accuracy: round(accuracy), confusion }
}

export function evaluateTextClassifier(records) {
  const results = records.map((record) => classifyMessage(messageInput(record)))
  const actual = records.map((record) => record.label)
  const predicted = results.map((result) => result.classification)

  const matrix = Object.fromEntries(MESSAGE_LABELS.map((label) => [label, Object.fromEntries(MESSAGE_LABELS.map((other) => [other, 0]))]))
  actual.forEach((label, i) => (matrix[label][predicted[i]] += 1))

  const perLabel = Object.fromEntries(MESSAGE_LABELS.map((label) => [label, binary(actual, predicted, label)]))
  const macro = (key) => round(MESSAGE_LABELS.reduce((sum, label) => sum + (perLabel[label][key] ?? 0), 0) / MESSAGE_LABELS.length)

  // Share of each label's messages in which each signal fires.
  const coverage = Object.fromEntries(
    Object.keys(SIGNALS).map((id) => [
      id,
      Object.fromEntries(
        MESSAGE_LABELS.map((label) => {
          const indices = actual.map((value, i) => (value === label ? i : -1)).filter((i) => i >= 0)
          return [label, round(indices.filter((i) => results[i].signals.some((signal) => signal.id === id)).length / indices.length)]
        }),
      ),
    ]),
  )

  const byScenario = {}
  records.forEach((record, i) => {
    byScenario[record.scenario] ??= { label: record.label, records: 0, correct: 0 }
    byScenario[record.scenario].records += 1
    if (predicted[i] === record.label) byScenario[record.scenario].correct += 1
  })

  return {
    classifier: CLASSIFIER_VERSION,
    thresholds: THRESHOLDS,
    records: records.length,
    accuracy: round(actual.filter((label, i) => predicted[i] === label).length / records.length),
    macro: { precision: macro('precision'), recall: macro('recall'), f1: macro('f1') },
    confusionMatrix: matrix,
    perLabel,
    // Coarser views: exactly "fraudulent", and "needs attention"
    // (suspicious or fraudulent) against the two genuine labels.
    fraudVsRest: binary(actual, predicted, 'fraudulent'),
    flaggedVsGenuine: binary(actual, predicted, ['suspicious', 'fraudulent']),
    coverage,
    byScenario,
  }
}

function printReport(corpus, report) {
  console.log('SYNTHETIC-CORPUS EVALUATION. These results measure agreement with a synthetic')
  console.log('corpus written for this project, not accuracy on real messages. The corpus and')
  console.log('the classifier were written by the same author, so they are likely optimistic.\n')
  console.log(`Classifier ${report.classifier}, thresholds ${JSON.stringify(report.thresholds)}`)
  console.log(`Corpus ${corpus.version}, seed "${corpus.config.seed}", ${report.records} messages\n`)

  const width = 15
  console.log('Confusion matrix (rows = corpus label, columns = classifier output):')
  console.log(`  ${''.padEnd(width)}${MESSAGE_LABELS.map((label) => label.padStart(width)).join('')}`)
  for (const label of MESSAGE_LABELS) console.log(`  ${label.padEnd(width)}${MESSAGE_LABELS.map((other) => String(report.confusionMatrix[label][other]).padStart(width)).join('')}`)

  console.log(`\nAccuracy ${pct(report.accuracy)}   macro precision ${pct(report.macro.precision)}   macro recall ${pct(report.macro.recall)}   macro F1 ${pct(report.macro.f1)}`)
  console.log('\nPer label (one-vs-rest):')
  console.log(`  ${'label'.padEnd(width)}${'support'.padStart(9)}${'precision'.padStart(11)}${'recall'.padStart(9)}${'F1'.padStart(9)}`)
  for (const [label, entry] of Object.entries(report.perLabel)) {
    console.log(`  ${label.padEnd(width)}${String(entry.support).padStart(9)}${pct(entry.precision).padStart(11)}${pct(entry.recall).padStart(9)}${pct(entry.f1).padStart(9)}`)
  }
  for (const [name, entry] of [['fraudulent vs rest', report.fraudVsRest], ['suspicious+fraudulent vs genuine', report.flaggedVsGenuine]]) {
    console.log(`\n${name}: precision ${pct(entry.precision)}, recall ${pct(entry.recall)}, F1 ${pct(entry.f1)} (${JSON.stringify(entry.confusion)})`)
  }

  console.log('\nSignal coverage (share of each label’s messages where the signal fires):')
  console.log(`  ${'signal'.padEnd(24)}${MESSAGE_LABELS.map((label) => label.padStart(width)).join('')}`)
  for (const [id, shares] of Object.entries(report.coverage)) console.log(`  ${id.padEnd(24)}${MESSAGE_LABELS.map((label) => pct(shares[label]).padStart(width)).join('')}`)

  console.log('\nBy scenario (correct / records):')
  for (const [scenario, entry] of Object.entries(report.byScenario).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${scenario.padEnd(28)}${entry.label.padEnd(15)}${`${entry.correct}/${entry.records}`.padStart(7)}`)
  }
}

const options = parseArgs(process.argv.slice(2))
const corpus = generateMessageCorpus(options.seed ? { seed: options.seed } : {})
const report = evaluateTextClassifier(corpus.records)
if (options.json) console.log(JSON.stringify({ corpus: { version: corpus.version, seed: corpus.config.seed }, ...report }, null, 2))
else printReport(corpus, report)
