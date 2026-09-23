// Text patterns shared by the rule-based checks (checks.js) and feature
// extraction (features.js). One source of truth, so later text analysis can
// reuse them. The patterns are keyword rules only; changing any of them
// changes both the engine scores and the model features.

// Scam-language patterns for the request text. The checks penalise each match
// and feature extraction records each one as a flag.
export const LANGUAGE_PATTERNS = [
  {
    id: 'urgency',
    label: 'Urgency pressure',
    penalty: 0.2,
    pattern: /\b(urgent(ly)?|immediately|today|right away|as soon as possible|within \d+ (hours?|minutes?)|before \d{1,2}[:.]\d{2})/i,
  },
  {
    id: 'threat',
    label: 'Threat of consequences',
    penalty: 0.25,
    pattern: /\b(suspen(d|ded|sion)|frozen|freeze|blocked|legal action|penalt(y|ies)|closure)\b/i,
  },
  {
    id: 'bypassChecks',
    label: 'Asks you to bypass normal checks',
    penalty: 0.3,
    pattern: /\b(no need to (contact|call|verify)|do not (contact|call|tell)|don't (contact|call|tell)|without (verifying|checking)|skip (the )?(verification|checks?))\b/i,
  },
  {
    id: 'externalLink',
    label: 'External link or website',
    penalty: 0.25,
    pattern: /(https?:\/\/\S+|\b[a-z0-9-]+\.(com|net|org|info|xyz|link|site|online)\b)/i,
  },
  {
    id: 'sensitiveInfo',
    label: 'Requests sensitive information',
    penalty: 0.35,
    pattern: /\b(otp|one-time (pass)?code|pin|password|card number|cvv)\b/i,
  },
  {
    id: 'bankImpersonation',
    label: 'Claims to act for your bank',
    penalty: 0.2,
    pattern: /\b(security team|account protection|security review|on behalf of (your|the) bank|bank officer|fraud department)\b/i,
  },
]

// Request text saying the payee's bank or account details have changed.
export const CHANGED_DETAILS_TEXT =
  /\b(new|updated|changed|revised)\b[^.]{0,40}\b(bank details|account details|account|payment details)\b|\b(bank details|account details|payment details|account) (was|were|has been|have been|have|has) (changed|updated)\b|\bno longer active\b/i

// Request text promising investment returns.
export const PROMISED_RETURNS_TEXT = /\b(guaranteed|returns?|profits?|double your|interest of \d+%|\d+% (monthly|weekly))\b/i

// Security-themed payee names. There are two deliberately different patterns:
// they match different names, and each is tied to its own consumer.
//
// Used by the recipient check (checkRecipient) for its score penalty. Unanchored
// substring match.
export const SECURITY_NAME_RULE_PATTERN = /secure|settlement|holding|verif|safe account|protection/i

// Used by feature extraction for the securityThemedRecipientName feature.
// Word-bounded and broader.
export const SECURITY_NAME_FEATURE_PATTERN = /\b(secure\w*|safe\w*|verif\w*|shield\w*|guardian\w*|settlements?|holding|escrow|clearing|protection)\b/i
