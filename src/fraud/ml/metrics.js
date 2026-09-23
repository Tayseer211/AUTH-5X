// Evaluation metrics for a binary fraud classifier. `labels` are booleans or
// 0/1 (true = fraud); `scores` are higher-means-more-likely-fraud numbers.
// A record is flagged when its score is at or above the threshold.
// Ratios with a zero denominator are null rather than 0 or NaN.

const ratio = (a, b) => (b === 0 ? null : a / b)
const positive = (label) => label === true || label === 1

export function confusionMatrix(labels, scores, threshold) {
  const matrix = { truePositives: 0, falsePositives: 0, trueNegatives: 0, falseNegatives: 0 }
  labels.forEach((label, i) => {
    const flagged = scores[i] >= threshold
    if (positive(label)) matrix[flagged ? 'truePositives' : 'falseNegatives'] += 1
    else matrix[flagged ? 'falsePositives' : 'trueNegatives'] += 1
  })
  return matrix
}

export function classificationMetrics({ truePositives: tp, falsePositives: fp, trueNegatives: tn, falseNegatives: fn }) {
  const precision = ratio(tp, tp + fp)
  const recall = ratio(tp, tp + fn)
  return {
    accuracy: ratio(tp + tn, tp + fp + tn + fn),
    precision,
    recall,
    f1: precision == null || recall == null || precision + recall === 0 ? (tp + fp + fn === 0 ? null : 0) : (2 * precision * recall) / (precision + recall),
    specificity: ratio(tn, tn + fp),
    falsePositiveRate: ratio(fp, fp + tn),
    flagged: tp + fp,
  }
}

export function evaluateAt(labels, scores, threshold) {
  const confusion = confusionMatrix(labels, scores, threshold)
  return { threshold, confusion, ...classificationMetrics(confusion) }
}

// Area under the ROC curve: the probability that a random fraud record scores
// higher than a random legitimate one (ties count half).
export function rocAuc(labels, scores) {
  const order = scores.map((score, i) => [score, i]).sort((a, b) => a[0] - b[0])
  const ranks = new Array(scores.length)
  for (let start = 0; start < order.length; ) {
    let end = start
    while (end + 1 < order.length && order[end + 1][0] === order[start][0]) end += 1
    const rank = (start + end) / 2 + 1
    for (let k = start; k <= end; k += 1) ranks[order[k][1]] = rank
    start = end + 1
  }
  const nPos = labels.filter(positive).length
  const nNeg = labels.length - nPos
  if (!nPos || !nNeg) return null
  const rankSum = labels.reduce((sum, label, i) => (positive(label) ? sum + ranks[i] : sum), 0)
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
}

// Average precision (area under the precision–recall curve), with tied
// scores handled as one step.
export function averagePrecision(labels, scores) {
  const nPos = labels.filter(positive).length
  if (!nPos) return null
  const order = scores.map((score, i) => [score, i]).sort((a, b) => b[0] - a[0])
  let tp = 0
  let seen = 0
  let area = 0
  for (let start = 0; start < order.length; ) {
    let end = start
    while (end + 1 < order.length && order[end + 1][0] === order[start][0]) end += 1
    let newPositives = 0
    for (let k = start; k <= end; k += 1) if (positive(labels[order[k][1]])) newPositives += 1
    tp += newPositives
    seen += end - start + 1
    area += (newPositives / nPos) * (tp / seen)
    start = end + 1
  }
  return area
}

export function logLoss(labels, probabilities) {
  const eps = 1e-12
  const total = labels.reduce((sum, label, i) => {
    const p = Math.min(1 - eps, Math.max(eps, probabilities[i]))
    return sum - (positive(label) ? Math.log(p) : Math.log(1 - p))
  }, 0)
  return total / labels.length
}

export function brierScore(labels, probabilities) {
  return labels.reduce((sum, label, i) => sum + (probabilities[i] - (positive(label) ? 1 : 0)) ** 2, 0) / labels.length
}

export function thresholdTable(labels, scores, thresholds) {
  return thresholds.map((threshold) => evaluateAt(labels, scores, threshold))
}

// The threshold with the highest F1 among `thresholds`; ties go to the lower
// threshold (more fraud caught for the same F1).
export function bestF1Threshold(labels, scores, thresholds) {
  let best = null
  for (const threshold of thresholds) {
    const result = evaluateAt(labels, scores, threshold)
    if (best === null || (result.f1 ?? -1) > (best.f1 ?? -1)) best = result
  }
  return best
}
