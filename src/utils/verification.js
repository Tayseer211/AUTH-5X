// Simulated fraud-check engine for the demo. There is no real scoring model —
// each check simply reads the transaction's mock `riskLevel` and returns
// canned, tone-appropriate findings so the verification flow has something
// realistic to show.

const CHECK_ORDER = ['recipient', 'message', 'pattern', 'device', 'duplicate']

const CHECK_LABELS = {
  recipient: 'Recipient reputation',
  message: 'Message & link analysis',
  pattern: 'Spending pattern match',
  device: 'Device & location match',
  duplicate: 'Duplicate request check',
}

function lowRiskChecks(tx) {
  return {
    recipient: {
      status: 'success',
      findings: [
        `${tx.recipient} has an established payment history with no disputes.`,
        'No fraud reports are linked to this contact.',
      ],
    },
    message: {
      status: 'success',
      findings: [
        'No suspicious links or urgency language detected.',
        'Message tone matches previous conversations with this contact.',
      ],
    },
    pattern: {
      status: 'success',
      findings: ['Amount and timing are consistent with your regular spending.'],
    },
    device: {
      status: 'success',
      findings: ['Request originated from your registered device and home network.'],
    },
    duplicate: {
      status: 'success',
      findings: ['No matching request was sent in the last 30 days.'],
    },
  }
}

function mediumRiskChecks(tx) {
  return {
    recipient: {
      status: 'warning',
      findings: [
        `${tx.recipient} was added as a payee recently.`,
        'Prior payments to this contact completed without issue.',
      ],
    },
    message: {
      status: 'success',
      findings: ['No suspicious links detected.', 'Language is consistent with a standard request.'],
    },
    pattern: {
      status: 'warning',
      findings: ['This amount is higher than your average payment to this recipient.'],
    },
    device: {
      status: 'success',
      findings: ['Request originated from your registered device.'],
    },
    duplicate: {
      status: 'success',
      findings: ['No matching duplicate request found in the last 30 days.'],
    },
  }
}

function highRiskChecks(tx) {
  return {
    recipient: {
      status: 'danger',
      findings: [
        'This payee was added less than an hour ago.',
        `No prior payment history with ${tx.recipient}.`,
      ],
    },
    message: {
      status: 'danger',
      findings: [
        'Message uses urgency language ("before end of day", "right away").',
        'Claims the recipient’s usual account is unavailable — a common payment-redirect scam pattern.',
      ],
    },
    pattern: {
      status: 'danger',
      findings: [`This ${tx.channel.toLowerCase()} is significantly larger than your typical payments.`],
    },
    device: {
      status: 'warning',
      findings: ['Request was submitted from a browser session we haven’t seen before.'],
    },
    duplicate: {
      status: 'success',
      findings: ['No matching duplicate request found.'],
    },
  }
}

const RISK_PROFILES = {
  low: {
    checks: lowRiskChecks,
    score: 96,
    tone: 'success',
    verdict: 'This looks safe',
    explanation: 'Every check came back clean. You can approve this payment with confidence.',
  },
  medium: {
    checks: mediumRiskChecks,
    score: 68,
    tone: 'warning',
    verdict: 'Proceed with caution',
    explanation:
      'Most checks passed, but this payee is newer than usual and the amount is larger than expected. Confirm the request through a trusted channel before approving.',
  },
  high: {
    checks: highRiskChecks,
    score: 18,
    tone: 'danger',
    verdict: 'High risk of fraud',
    explanation:
      'This request shows several classic signs of a payment redirection scam. We strongly recommend denying it and confirming with the recipient through a separate, trusted channel.',
  },
}

export const VERIFICATION_STEPS = [
  'Checking recipient reputation',
  'Scanning message for scam patterns',
  'Comparing against your spending history',
  'Matching device and location',
  'Looking for duplicate requests',
]

export function computeVerification(tx) {
  const profile = RISK_PROFILES[tx.riskLevel] || RISK_PROFILES.medium
  const checkResults = profile.checks(tx)

  return {
    score: profile.score,
    tone: profile.tone,
    verdict: profile.verdict,
    explanation: profile.explanation,
    checks: CHECK_ORDER.map((id) => ({
      id,
      label: CHECK_LABELS[id],
      status: checkResults[id].status,
      findings: checkResults[id].findings,
    })),
  }
}
