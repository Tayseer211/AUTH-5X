// Mock data for the frontend-only fraud.auth demo. Nothing here touches a
// real backend or a real bank — see public/prototype/fraud-auth-prototype.html
// for the original design reference this app is rebuilt from.

export const BANKS = [
  { id: 'chase', name: 'Chase' },
  { id: 'boa', name: 'Bank of America' },
  { id: 'wells-fargo', name: 'Wells Fargo' },
  { id: 'citibank', name: 'Citibank' },
  { id: 'capital-one', name: 'Capital One' },
  { id: 'pnc', name: 'PNC Bank' },
]

export function bankMonogram(bankName) {
  return bankName
    .split(' ')
    .filter((word) => word.toLowerCase() !== 'of')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

// status: 'pending' (awaiting review) | 'completed' (already settled, no
// review needed) | 'approved' | 'denied' | 'flagged' (already reviewed)
export const INITIAL_TRANSACTIONS = [
  {
    id: 'tx-1',
    recipient: 'Marcus Webb',
    direction: 'out',
    amount: 2450.0,
    date: '2026-09-23',
    status: 'pending',
    riskLevel: 'high',
    channel: 'Wire transfer',
    requestedVia: 'Email link',
    reference: 'INV-88213',
    message:
      "Hi, please send the remaining invoice balance to my new account before end of day — my old one is temporarily locked.",
  },
  {
    id: 'tx-2',
    recipient: 'Chen Logistics LLC',
    direction: 'out',
    amount: 860.0,
    date: '2026-09-22',
    status: 'pending',
    riskLevel: 'medium',
    channel: 'ACH transfer',
    requestedVia: 'In-app request',
    reference: 'PO-4471',
    message: "Payment due for the October shipment. Let us know once it's sent.",
  },
  {
    id: 'tx-3',
    recipient: 'Alex Rivera',
    direction: 'out',
    amount: 120.0,
    date: '2026-09-22',
    status: 'pending',
    riskLevel: 'low',
    channel: 'Zelle',
    requestedVia: 'Text message',
    reference: '—',
    message: 'Thanks for covering dinner, sending your half back now!',
  },
  {
    id: 'tx-4',
    recipient: 'Green Valley Utilities',
    direction: 'out',
    amount: 184.32,
    date: '2026-09-18',
    status: 'completed',
    riskLevel: 'low',
    channel: 'Autopay',
    requestedVia: 'Scheduled payment',
    reference: 'ACCT-55210',
    message: 'Monthly utility autopay.',
  },
  {
    id: 'tx-5',
    recipient: 'Payroll Inc.',
    direction: 'in',
    amount: 3200.0,
    date: '2026-09-15',
    status: 'completed',
    riskLevel: 'low',
    channel: 'Direct deposit',
    requestedVia: 'Employer',
    reference: 'PAYROLL-0915',
    message: 'Biweekly payroll deposit.',
  },
  {
    id: 'tx-6',
    recipient: 'Priority Refunds Dept',
    direction: 'out',
    amount: 975.0,
    date: '2026-09-11',
    status: 'denied',
    riskLevel: 'high',
    channel: 'Wire transfer',
    requestedVia: 'Phone call',
    reference: '—',
    message: "Pay a small processing fee upfront to release your refund.",
  },
  {
    id: 'tx-7',
    recipient: 'Dana Whitfield',
    direction: 'out',
    amount: 340.0,
    date: '2026-09-09',
    status: 'flagged',
    riskLevel: 'medium',
    channel: 'Zelle',
    requestedVia: 'Text message',
    reference: '—',
    message: 'Can you send this to my other account instead this time?',
  },
  {
    id: 'tx-8',
    recipient: 'Sarah Kim',
    direction: 'in',
    amount: 75.0,
    date: '2026-09-05',
    status: 'completed',
    riskLevel: 'low',
    channel: 'Zelle',
    requestedVia: 'In-app request',
    reference: '—',
    message: 'Reimbursement for concert tickets.',
  },
]
