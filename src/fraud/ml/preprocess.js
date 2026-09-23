import { MODEL_FEATURES } from './featureSpec.js'

// Turns a record's { raw, derived } features into the numeric vector the
// model reads. `fitPreprocessor` learns the encoding from training records
// only (medians, means, standard deviations, category levels); the result is
// plain JSON, stored in the model artifact, so a request scored later is
// encoded exactly as the training data was. Pure and browser-safe.

export const PREPROCESSOR_VERSION = 1
export const MISSING_LEVEL = '__missing__'
// Standardised values are clipped to ±CLIP so one extreme input cannot
// dominate the score.
const CLIP = 5
const PRECISION = 1e8

const round = (value) => Math.round(value * PRECISION) / PRECISION

const TRANSFORMS = {
  log1p: (value) => Math.log1p(Math.max(value, 0)),
  log: (value) => Math.log(Math.max(value, 1e-3)),
}

function readValue(features, spec) {
  const value = features?.[spec.source]?.[spec.name]
  return value === undefined ? null : value
}

function numericValue(value, transform) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return transform ? TRANSFORMS[transform](value) : value
}

const categoryLevel = (value) => (value === null ? MISSING_LEVEL : String(value))

function median(sorted) {
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function fitFeature(spec, values) {
  const base = { source: spec.source, name: spec.name, kind: spec.kind }
  switch (spec.kind) {
    case 'numeric': {
      const transformed = values.map((value) => numericValue(value, spec.transform))
      const center = median(transformed.filter((value) => value !== null).sort((a, b) => a - b))
      const filled = transformed.map((value) => value ?? center)
      const mean = filled.reduce((sum, value) => sum + value, 0) / filled.length
      const sd = Math.sqrt(filled.reduce((sum, value) => sum + (value - mean) ** 2, 0) / filled.length)
      return {
        ...base,
        transform: spec.transform ?? null,
        median: round(center),
        mean: round(mean),
        sd: sd > 1e-12 ? round(sd) : 1,
        missingIndicator: Boolean(spec.nullable),
      }
    }
    case 'boolean':
      return base
    case 'category':
      // The declared vocabulary (if any) plus anything observed in training.
      return { ...base, levels: [...new Set([...(spec.values ?? []), ...values].map(categoryLevel))].sort() }
    case 'cyclic':
      return { ...base, period: spec.period }
    default:
      throw new Error(`Unknown feature kind ${spec.kind} for ${spec.name}`)
  }
}

function featureColumns(feature) {
  switch (feature.kind) {
    case 'numeric':
      return feature.missingIndicator ? [feature.name, `${feature.name}__missing`] : [feature.name]
    case 'boolean':
      return [feature.name]
    case 'category':
      return feature.levels.map((level) => `${feature.name}=${level}`)
    case 'cyclic':
      return [`${feature.name}__sin`, `${feature.name}__cos`]
    default:
      throw new Error(`Unknown feature kind ${feature.kind}`)
  }
}

// `records` are training records (anything with `raw` and `derived`). Only
// the feature sections are read: labels, benchmark scores and IDs never reach
// the encoder.
export function fitPreprocessor(records, specs = MODEL_FEATURES) {
  if (!records.length) throw new Error('Cannot fit a preprocessor on no records')
  const features = specs.map((spec) => fitFeature(spec, records.map((record) => readValue(record, spec))))
  return { version: PREPROCESSOR_VERSION, clip: CLIP, features, columns: features.flatMap(featureColumns) }
}

// Encodes one { raw, derived } feature set. Unexpected values (a category not
// seen in training, a missing required value) are encoded neutrally and
// reported in `warnings` rather than thrown, so one odd field cannot block
// scoring — but callers can see that the input was out of distribution.
export function transformFeatures(preprocessor, features) {
  const vector = []
  const warnings = []
  const clip = (value) => Math.max(-preprocessor.clip, Math.min(preprocessor.clip, value))

  for (const feature of preprocessor.features) {
    const value = readValue(features, feature)
    switch (feature.kind) {
      case 'numeric': {
        const transformed = numericValue(value, feature.transform)
        if (transformed === null && !feature.missingIndicator) warnings.push(`${feature.name}: missing, imputed with the training median`)
        vector.push(clip(((transformed ?? feature.median) - feature.mean) / feature.sd))
        if (feature.missingIndicator) vector.push(transformed === null ? 1 : 0)
        break
      }
      case 'boolean':
        if (typeof value !== 'boolean') warnings.push(`${feature.name}: expected a boolean, got ${JSON.stringify(value)}`)
        vector.push(value === true ? 1 : 0)
        break
      case 'category': {
        const level = categoryLevel(value)
        if (!feature.levels.includes(level)) warnings.push(`${feature.name}: unseen category ${JSON.stringify(value)}`)
        for (const known of feature.levels) vector.push(known === level ? 1 : 0)
        break
      }
      case 'cyclic': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          warnings.push(`${feature.name}: missing`)
          vector.push(0, 0)
        } else {
          const angle = (2 * Math.PI * value) / feature.period
          vector.push(Math.sin(angle), Math.cos(angle))
        }
        break
      }
      default:
        throw new Error(`Unknown feature kind ${feature.kind}`)
    }
  }
  return { vector, warnings }
}
