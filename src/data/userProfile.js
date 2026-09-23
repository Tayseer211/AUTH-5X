// The behavioural profile the fraud engine compares each request against.
// It is currently one fixed, simulated profile shared by every account; a
// later step will derive it from the user's own transaction history.

const USUAL_PAYMENT_DAYS = [1, 2, 3, 4, 5, 25, 26, 27, 28, 29, 30, 31]

export const DEMO_PROFILE = {
  knownRecipients: [
    { name: 'ABC Services Ltd.', relationship: 'Office cleaning contract', agreementOnFile: true, expectedFrequency: 'MONTHLY' },
    { name: 'Harbourline Property Management', relationship: 'Building maintenance fees', agreementOnFile: true, expectedFrequency: 'MONTHLY' },
    { name: 'Lumière Fibre Ltd', relationship: 'Home internet', agreementOnFile: true, expectedFrequency: 'MONTHLY' },
    { name: 'Coastal Shield Insurance', relationship: 'Home insurance', agreementOnFile: true, expectedFrequency: 'MONTHLY' },
  ],
  standingOrderAmountRange: { min: 1500, max: 7500 },
  usualFrequencies: ['MONTHLY'],
  usualPaymentDays: USUAL_PAYMENT_DAYS,
  usualPaymentDaysLabel: '1st–5th and 25th–31st',
  // Hours in local time, [start, end). TIMEZONE: should be Indian/Mauritius.
  activeHours: { start: 7, end: 22 },
  knownDevices: ['device-home-laptop', 'device-personal-phone'],
  usualChannel: 'ONLINE_BANKING',
}
