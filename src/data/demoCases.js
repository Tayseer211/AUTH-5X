import { createId } from '../utils/ids.js'
import { getBank } from './banks.js'
import { APP_TIMEZONE, addMonths, daysInMonth, zonedDate, zonedParts } from '../utils/time.js'

const DAY_MS = 24 * 60 * 60 * 1000

// The three controlled standing-order demonstrations. Each case only carries
// raw request features; the fraud engine never reads `verificationCase`, so
// the scores (100 / 69 / 8 today) are derived from these features alone.
export const VERIFICATION_CASES = {
  LEGITIMATE: 'LEGITIMATE',
  GREY: 'GREY',
  FRAUD: 'FRAUD',
}

export const DEMO_CASES = [
  {
    verificationCase: VERIFICATION_CASES.LEGITIMATE,
    recipient: 'ABC Services Ltd.',
    recipientAccount: '4417',
    recipientBank: 'Same bank',
    amount: 5000,
    frequency: 'MONTHLY',
    dayOfMonth: 30,
    initiatedAt: { hour: 10, minute: 15 },
    channel: 'ONLINE_BANKING',
    deviceId: 'device-home-laptop',
    beneficiaryAddedMinutesBefore: null,
    description: 'Office cleaning contract',
    requestText:
      'Monthly service fee for the office cleaning contract (ref ABC-2291), as per the agreement signed in August. Payment to be made on the 30th of each month.',
  },
  {
    verificationCase: VERIFICATION_CASES.GREY,
    recipient: 'Harbourline Property Management',
    recipientAccount: '0932',
    recipientBank: 'Another local bank',
    amount: 12500,
    frequency: 'MONTHLY',
    dayOfMonth: 17,
    initiatedAt: { hour: 23, minute: 40 },
    channel: 'ONLINE_BANKING',
    deviceId: 'device-personal-phone',
    beneficiaryAddedMinutesBefore: null,
    description: 'Revised building maintenance contribution',
    requestText:
      "Revised monthly building maintenance contribution agreed at the annual general meeting. The new amount applies from this month's cycle. Reference HPM-Unit 4B.",
  },
  {
    verificationCase: VERIFICATION_CASES.FRAUD,
    recipient: 'SecureVault Settlements Ltd',
    recipientAccount: '7781',
    recipientBank: 'Another local bank',
    amount: 48000,
    frequency: 'WEEKLY',
    dayOfMonth: 12,
    initiatedAt: { hour: 2, minute: 14 },
    channel: 'EMAIL_LINK',
    deviceId: 'device-unrecognised',
    beneficiaryAddedMinutesBefore: 14,
    description: 'Account protection settlement',
    requestText:
      'Dear customer, as part of the {BANK} account protection review, a weekly settlement to our secure holding partner is required to keep your online banking active. Please complete this standing order today before 17:00 to avoid temporary suspension. Our security team is handling this directly, so there is no need to contact your branch. Confirm the arrangement at {BANK_SLUG}-secure-review.com once submitted.',
  },
]

// Next occurrence of `dayOfMonth` (clamped to short months) that is at least
// two days away, at 06:00 Mauritius time.
export function firstPaymentDate(now, dayOfMonth, timeZone = APP_TIMEZONE) {
  const earliest = new Date(now.getTime() + 2 * DAY_MS)
  const current = zonedParts(now, timeZone)

  for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
    const month = addMonths(current, monthOffset)
    const candidate = zonedDate({ ...month, day: Math.min(dayOfMonth, daysInMonth(month)), hour: 6 }, timeZone)
    if (candidate >= earliest) return candidate
  }
  return earliest
}

function shuffle(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Builds the three pending standing-order requests for one demo run, in a
// random queue order, personalised with the user's bank name.
export function createDemoRequests(user, { run = 1, now = new Date() } = {}) {
  const bankName = getBank(user.bank?.code)?.name ?? 'your bank'
  const bankSlug = bankName.toLowerCase().replace(/[^a-z0-9]/g, '')

  const today = zonedParts(now, APP_TIMEZONE)

  return shuffle(DEMO_CASES).map((demoCase, queuePosition) => {
    // Set up yesterday at the case's Mauritius wall-clock time; the behaviour
    // check compares this hour against the user's active hours.
    const { hour, minute } = demoCase.initiatedAt
    const initiatedAt = zonedDate({ ...today, day: today.day - 1, hour, minute }, APP_TIMEZONE).toISOString()

    return {
      id: createId('txn'),
      reference: `SO-${String(Math.floor(10000 + Math.random() * 89999))}`,
      type: 'STANDING_ORDER',
      direction: 'OUT',
      recipient: demoCase.recipient,
      recipientAccount: demoCase.recipientAccount,
      recipientBank: demoCase.recipientBank,
      amount: demoCase.amount,
      currency: 'MUR',
      date: firstPaymentDate(now, demoCase.dayOfMonth).toISOString(),
      status: 'PENDING',
      riskScore: null,
      riskLevel: null,
      frequency: demoCase.frequency,
      description: demoCase.description,
      requestText: demoCase.requestText.replaceAll('{BANK_SLUG}', bankSlug).replaceAll('{BANK}', bankName),
      requiresApproval: true,
      verificationCase: demoCase.verificationCase,
      queuePosition,
      demoRun: run,
      analysis: null,
      decision: null,
      proof: null,
      context: {
        channel: demoCase.channel,
        deviceId: demoCase.deviceId,
        initiatedAt,
        beneficiaryAddedMinutesBefore: demoCase.beneficiaryAddedMinutesBefore,
      },
      // First run uses the request time; replays sort after existing history.
      createdAt: run === 1 ? initiatedAt : new Date(now.getTime() + queuePosition).toISOString(),
      updatedAt: initiatedAt,
    }
  })
}
