// Binary logistic regression with L2 regularisation, fitted by Newton's
// method (iteratively reweighted least squares) with a backtracking line
// search. Deterministic: weights start at zero and there is no sampling, so
// the same data and settings always give the same model.
//
// Minimises  mean log loss + (l2 / 2) · ‖w‖²   (the bias is not penalised).

export const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)))

const dot = (a, b) => {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]
  return sum
}

// Solves A x = b for symmetric positive-definite A (Cholesky).
function solveSpd(A, b) {
  const n = b.length
  const L = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = A[i][j]
      for (let k = 0; k < j; k += 1) sum -= L[i][k] * L[j][k]
      if (i === j) {
        if (!(sum > 0)) throw new Error('Hessian is not positive definite')
        L[i][i] = Math.sqrt(sum)
      } else {
        L[i][j] = sum / L[j][j]
      }
    }
  }
  const y = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    let sum = b[i]
    for (let k = 0; k < i; k += 1) sum -= L[i][k] * y[k]
    y[i] = sum / L[i][i]
  }
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = y[i]
    for (let k = i + 1; k < n; k += 1) sum -= L[k][i] * x[k]
    x[i] = sum / L[i][i]
  }
  return x
}

function objective(X, y, weights, bias, l2) {
  let loss = 0
  for (let i = 0; i < X.length; i += 1) {
    const z = bias + dot(weights, X[i])
    // log(1 + e^z) − y·z, computed stably.
    loss += (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z))) - y[i] * z
  }
  return loss / X.length + (l2 / 2) * dot(weights, weights)
}

// X: array of equal-length numeric rows; y: array of 0/1.
export function trainLogisticRegression(X, y, { l2 = 0.01, maxIterations = 100, tolerance = 1e-10 } = {}) {
  const n = X.length
  if (!n || n !== y.length) throw new Error('X and y must be non-empty and the same length')
  const d = X[0].length
  const positives = y.reduce((sum, value) => sum + value, 0)
  if (positives === 0 || positives === n) throw new Error('Training labels must contain both classes')

  let weights = new Float64Array(d)
  let bias = Math.log(positives / (n - positives))
  let current = objective(X, y, weights, bias, l2)
  let iterations = 0
  let converged = false

  while (iterations < maxIterations) {
    iterations += 1
    // Gradient and Hessian; index d is the bias.
    const gradient = new Float64Array(d + 1)
    const hessian = Array.from({ length: d + 1 }, () => new Float64Array(d + 1))
    for (let i = 0; i < n; i += 1) {
      const row = X[i]
      const p = sigmoid(bias + dot(weights, row))
      const residual = p - y[i]
      const w = Math.max(p * (1 - p), 1e-12)
      for (let j = 0; j < d; j += 1) {
        gradient[j] += residual * row[j]
        const wx = w * row[j]
        if (wx === 0) continue
        const hj = hessian[j]
        for (let k = 0; k <= j; k += 1) hj[k] += wx * row[k]
        hessian[d][j] += wx
      }
      gradient[d] += residual
      hessian[d][d] += w
    }
    for (let j = 0; j <= d; j += 1) {
      gradient[j] /= n
      for (let k = 0; k <= j; k += 1) hessian[j][k] /= n
    }
    for (let j = 0; j < d; j += 1) {
      gradient[j] += l2 * weights[j]
      hessian[j][j] += l2
    }
    hessian[d][d] += 1e-12
    // Mirror the lower triangle.
    for (let j = 0; j <= d; j += 1) for (let k = j + 1; k <= d; k += 1) hessian[j][k] = hessian[k][j]

    const step = solveSpd(hessian, gradient)
    const decrease = dot(gradient, step)

    // Backtracking (Armijo) line search along the Newton direction.
    let size = 1
    let nextWeights
    let nextBias
    let next
    for (let attempt = 0; attempt < 40; attempt += 1) {
      nextWeights = weights.map((value, j) => value - size * step[j])
      nextBias = bias - size * step[d]
      next = objective(X, y, nextWeights, nextBias, l2)
      if (next <= current - 1e-4 * size * decrease) break
      size /= 2
    }

    const change = Math.max(...Array.from(step, (value) => Math.abs(value * size)))
    weights = nextWeights
    bias = nextBias
    current = next
    if (change < tolerance || decrease < tolerance) {
      converged = true
      break
    }
  }

  return { weights: Array.from(weights), bias, l2, iterations, converged, objective: current }
}

export function predictProbability(weights, bias, row) {
  return sigmoid(bias + dot(weights, row))
}
