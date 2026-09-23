import { extractFeatures } from '../features.js'
import { predictProbability } from './logistic.js'
import { PREPROCESSOR_VERSION, transformFeatures } from './preprocess.js'

// Prediction interface for the trained fraud model. Pure and browser-safe:
// the artifact (JSON written by scripts/train-fraud-model.js) is passed in,
// nothing is read from disk here.
//
//   request ─► extractFeatures (features.js) ─► predictFraud ─► probability
//
// The same extractFeatures produced the training data, and the artifact
// carries the preprocessing learnt at training time, so a new request is
// encoded exactly as the training records were.
//
// Not wired into the app yet: the rule engine (engine.js) still produces the
// scores the UI shows.

export const MODEL_TYPE = 'logistic-regression'

export function loadFraudModel(artifact) {
  if (!artifact || artifact.modelType !== MODEL_TYPE) throw new Error(`Expected a ${MODEL_TYPE} model artifact`)
  const { preprocessing, weights, bias } = artifact.model ?? {}
  if (preprocessing?.version !== PREPROCESSOR_VERSION) throw new Error(`Unsupported preprocessing version ${preprocessing?.version}`)
  if (!Array.isArray(weights) || weights.length !== preprocessing.columns.length) throw new Error('Model weights do not match its feature columns')
  if (!weights.every(Number.isFinite) || !Number.isFinite(bias)) throw new Error('Model weights must be finite numbers')
  return Object.freeze({ modelVersion: artifact.modelVersion, preprocessing, weights, bias })
}

// `features` is extractFeatures' output: { raw, derived }.
// Returns { fraudProbability (0–1), modelVersion, warnings }.
export function predictFraud(model, features) {
  const { vector, warnings } = transformFeatures(model.preprocessing, features)
  return {
    fraudProbability: predictProbability(model.weights, model.bias, vector),
    modelVersion: model.modelVersion,
    warnings,
  }
}

// Convenience for a pending standing-order request: extracts its features
// against the user's history and profile, then predicts.
export function predictFraudForRequest(model, request, { history, profile, timeZone }) {
  return predictFraud(model, extractFeatures(request, { history, profile, timeZone }))
}
