import { engineFindingTopic, evidenceSignalTopic, messageSignalTopic } from '../fraud/signalFamilies.js'

// Pure helpers for the verification page's decision step.

// Whether the decision controls apply: the request has a stored analysis
// and is still waiting for approve / request information / reject. This does
// not depend on whether the analysis was run just now or on an earlier visit.
export function awaitingDecision(tx) {
  return Boolean(tx?.analysis) && !tx.decision && tx.status === 'PENDING' && Boolean(tx.requiresApproval)
}

// --- Warning list -----------------------------------------------------------
//
// The same concern can be reported by the transaction engine's language check,
// the message classifier and the evidence comparison, e.g. "Urgency pressure:
// “today”" and "Message signal: pressure to act quickly (“today”)". Warnings
// are grouped by topic, taken from the identifiers each source already
// produces (never by comparing wording; see fraud/signalFamilies.js), so each
// concern is listed once with all of its sources. Warnings without a known
// topic are kept as they are.

// When a concern has several sources, the first available of these supplies
// the wording: the engine's finding, then a payee history check, then the
// evidence sentence, then the message signal.
const SOURCE_PREFERENCE = ['transaction', 'profile', 'evidence', 'text']
export const WARNING_SOURCE_LABELS = { transaction: 'transaction checks', profile: 'payee history check', text: 'message analysis', evidence: 'evidence check' }
const TONE_RANK = { bad: 2, warn: 1, ok: 0 }

// Warnings for the decision panel: one entry per concern,
// `{ id, text, tone, sources }`, in the order the concerns first appear.
export function decisionWarnings(analysis, assessment) {
  const engine = analysis.checks
    .filter((check) => check.status !== 'PASS')
    .flatMap((check) =>
      check.findings
        .filter((finding) => finding.tone !== 'ok')
        .map((finding) => ({ source: 'transaction', tone: finding.tone, text: finding.text, topic: engineFindingTopic(check.id, finding.text) })),
    )

  const reasons = (assessment?.combined.reasons ?? []).filter((reason) => reason.tone !== 'ok')
  // The evidence layer flags code/PIN words even in warnings; the assessment
  // marks that as a "mention" unless the classifier also saw a request, and
  // such a mention is not the same concern as a request.
  const messageRequestsCodes = reasons.some((reason) => reason.source === 'text' && reason.signal === 'sensitiveInfoRequest')
  const assessed = reasons.map((reason) => {
    let topic = null
    if (reason.source === 'text') topic = messageSignalTopic(reason.signal)
    if (reason.source === 'evidence') topic = reason.signal === 'sensitive.request' && !messageRequestsCodes ? null : evidenceSignalTopic(reason.signal)
    return { source: reason.source, tone: reason.tone, text: reason.text, topic }
  })

  const groups = new Map()
  for (const item of [...engine, ...assessed]) {
    // Without a topic, identical text is still shown only once.
    const key = item.topic ? `topic:${item.topic}` : `text:${item.text}`
    if (!groups.has(key)) groups.set(key, { key, items: [] })
    groups.get(key).items.push(item)
  }

  return [...groups.values()].map(({ key, items }) => {
    const lead = SOURCE_PREFERENCE.map((source) => items.find((item) => item.source === source)).find(Boolean)
    return {
      id: key,
      text: lead.text,
      tone: items.reduce((worst, item) => (TONE_RANK[item.tone] > TONE_RANK[worst] ? item.tone : worst), lead.tone),
      sources: SOURCE_PREFERENCE.filter((source) => items.some((item) => item.source === source)),
    }
  })
}
