import artifact from '../../../models/fraud-model.json' with { type: 'json' }
import { prepareModel } from './explain.js'

// The app's fraud model: models/fraud-model.json (fraud-lr-1.1.0), loaded and
// validated once. The artifact itself is never modified here.
export const DEFAULT_MODEL = prepareModel(artifact)
