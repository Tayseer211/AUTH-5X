import { NAME_STEMS } from './catalog.js'
import { createRng } from './random.js'

// Synthetic labelled corpus of financial messages (invoices, reminders, bank
// notices, scams) for testing and evaluating text analysis.
//
// Entirely synthetic. Every message is built from templates written for this
// project; none is copied from a real message or a public dataset. Businesses
// are fictional (catalog.js name stems plus a business-type suffix), people are
// never named, links and email addresses use the reserved `.example` domain,
// and account numbers carry the SYNTHETIC_ACCOUNT_PREFIX, so none can belong
// to a real account. Phone numbers are never generated. The banks (MCB, SBM,
// MauBank) are the ones the app simulates.
//
// Labels follow the standing-order dataset's risk classes (scenarios.js):
//   legit_normal  — genuine;
//   legit_unusual — genuine but unusual or grey;
//   suspicious    — several warning signals, not unambiguously fraud;
//   fraudulent    — fraud.
// Realism rules: no single word decides a label. Genuine messages also say
// "urgent", "verify", "PIN", "frozen" or carry links, some frauds read as
// routine business mail without scam vocabulary, and French and Mauritian
// Kreol appear in every class, so language is never a signal.
//
// A classifier must read only `text` (see messageInput). `label`, `scenario`,
// `language`, `format` and `patternTags` describe the record for evaluation
// and must never be used as model input.

export const MESSAGE_CORPUS_VERSION = '1.0.0'

export const MESSAGE_LABELS = ['legit_normal', 'legit_unusual', 'suspicious', 'fraudulent']

export const DEFAULT_MESSAGE_CONFIG = {
  seed: 'fraud-auth-messages',
  counts: { legit_normal: 160, legit_unusual: 90, suspicious: 90, fraudulent: 140 },
}

// Synthetic account numbers are 12 digits starting with this prefix.
export const SYNTHETIC_ACCOUNT_PREFIX = '000999'
export const SYNTHETIC_DOMAIN_SUFFIX = '.example'

// The only field a classifier may read.
export const messageInput = (record) => record.text

// --- Vocabulary -------------------------------------------------------------

const BANKS = [
  { name: 'MCB', slug: 'mcb' },
  { name: 'SBM', slug: 'sbm' },
  { name: 'MauBank', slug: 'maubank' },
]

const MERCHANT_SUFFIXES = {
  UTILITY: ['Water Services', 'Power Utility', 'Energy Ltd'],
  TELECOM: ['Fibre Ltd', 'Telecom', 'Connect Ltd'],
  INSURANCE: ['Assurance Ltd', 'Insurance Co.', 'General Insurance'],
  PROPERTY: ['Residences Syndic', 'Property Management', 'Estate Services'],
  SCHOOL: ['Academy', 'College', 'Pre-School'],
  SERVICES: ['Cleaning Services', 'Garden Services', 'Maintenance Ltd', 'Renovation Ltd'],
  TRADING: ['Trading Ltd', 'Supplies Ltd', 'Distributors'],
  RETAIL: ['Home Store', 'Electronics', 'Hardware Co.'],
  INVEST: ['Capital Partners', 'Wealth Club', 'Asset Management'],
}

const OPENERS = {
  en: ['', '', 'Dear customer,', 'Hello,', 'Good morning,'],
  fr: ['', 'Bonjour,', 'Madame, Monsieur,', 'Cher client,'],
  mfe: ['', 'Bonzour,'],
}
const CLOSERS = {
  en: ['', '', 'Kind regards.', 'Thank you.', 'Regards, Customer Service.'],
  fr: ['', 'Cordialement.', 'Merci.', 'Bien à vous.'],
  mfe: ['', 'Mersi.', 'Mersi boukou.'],
}
const GREETING = /^(hi|hello|good morning|dear|bonjour|bonzour|madame)\b/i
const SIGN_OFF = /(kind regards|sent from|service comptabilité)/i

// --- Scenarios --------------------------------------------------------------

// Each scenario: label, language, format (sms | email | chat | letter),
// merchant type for {merchant}, reference prefix for {ref}, tags shared by
// its templates, and templates as [text, extra tags].
const SCENARIOS = [
  // ---- legit_normal ------------------------------------------------------
  {
    id: 'invoice',
    label: 'legit_normal',
    language: 'en',
    format: 'email',
    merchant: 'SERVICES',
    refPrefix: 'INV',
    tags: ['amount', 'reference'],
    templates: [
      ['Please find attached invoice {ref} from {merchant} for {amount}, due on {date}. You can pay by bank transfer quoting the invoice number.', ['deadline']],
      ['Invoice {ref} from {merchant}. Amount due: {amount}. Due date: {date}. Pay by bank transfer (quote {ref}) or at our office.', ['deadline']],
      ['This is a friendly reminder that invoice {ref} for {amount} is due on {date}. If you have already paid, please ignore this message.', ['deadline']],
      ['Your monthly statement from {merchant} is available at {url}. Balance due: {amount} (ref {ref}).', ['link']],
    ],
  },
  {
    id: 'utility_bill',
    label: 'legit_normal',
    language: 'en',
    format: 'sms',
    merchant: 'UTILITY',
    refPrefix: 'ACC',
    tags: ['amount', 'reference', 'deadline'],
    templates: [
      ['{merchant}: your bill of {amount} for account {ref} is due on {date}. Pay via internet banking or at any of our offices. Ignore if already paid.', []],
      ['Reminder from {merchant}: bill {ref}, {amount}, due {date}. To avoid a late payment fee, please pay by the due date.', ['threat']],
      ['{merchant}: URGENT notice of planned supply interruption on {date} from 08:00 to 14:00 for maintenance. No payment or action is required. Account {ref}, current balance {amount}.', ['urgency']],
    ],
  },
  {
    id: 'bank_notice',
    label: 'legit_normal',
    language: 'en',
    format: 'sms',
    merchant: 'SERVICES',
    refPrefix: 'SO',
    tags: ['bank_name'],
    templates: [
      ['{bank}: your standing order to {merchant} for {amount} will be paid on {date}. No action is needed. If you did not set this up, call the number on the back of your card.', ['amount', 'callback_official']],
      ['{bank} will never ask for your PIN, password or one-time code by SMS, email or phone. Never share them with anyone, including our staff.', ['credential_mention', 'security_wording']],
      ['{bank} security tip: our fraud team will never send you a link to log in. Always open the {bank} app or type our address yourself.', ['security_wording', 'credential_mention']],
      ['{bank}: your card ending in {last4} was temporarily frozen after 3 incorrect PIN attempts. To unlock it, visit any branch with your ID card or use the {bank} app.', ['credential_mention', 'security_wording']],
    ],
  },
  {
    id: 'insurance_renewal',
    label: 'legit_normal',
    language: 'en',
    format: 'letter',
    merchant: 'INSURANCE',
    refPrefix: 'POL',
    tags: ['amount', 'reference'],
    templates: [
      ['{merchant}: your policy {ref} renews on {date}. Premium: {amount}, collected by standing order from your account ending in {last4}. No action is needed unless your details have changed.', ['deadline']],
      ['Renewal notice, policy {ref}. Your cover with {merchant} continues from {date}. The annual premium of {amount} will be collected as usual. Please verify that your cover still meets your needs.', ['deadline']],
    ],
  },
  {
    id: 'payment_receipt',
    label: 'legit_normal',
    language: 'en',
    format: 'email',
    merchant: 'RETAIL',
    refPrefix: 'ORD',
    tags: ['amount', 'reference'],
    templates: [
      ['Thank you. We have received your payment of {amount} for order {ref}. Your receipt has been sent to your registered email.', []],
      ['Payment confirmation from {merchant}: {amount} received on {date} for order {ref}. Track your delivery at {url}.', ['link']],
    ],
  },
  {
    id: 'school_fees',
    label: 'legit_normal',
    language: 'en',
    format: 'letter',
    merchant: 'SCHOOL',
    refPrefix: 'STU',
    tags: ['amount', 'reference', 'deadline'],
    templates: [
      ["{merchant}: fees of {amount} for the coming term are payable by {date}. Please use your child's student number {ref} as the payment reference.", []],
      ['{merchant}: this is a reminder that term fees ({amount}) must be paid immediately if not yet settled, as the deadline of {date} has passed. Student number {ref}.', ['urgency']],
    ],
  },
  {
    id: 'invoice_fr',
    label: 'legit_normal',
    language: 'fr',
    format: 'email',
    merchant: 'TELECOM',
    refPrefix: 'INV',
    tags: ['amount', 'reference', 'deadline'],
    templates: [
      ["Veuillez trouver ci-joint la facture {ref} de {merchant} d'un montant de {amount}, payable avant le {date}. Merci de mentionner la référence lors du virement.", []],
      ['{merchant} : votre facture {ref} de {amount} est disponible. Date limite de paiement : {date}. Consultez-la sur {url}.', ['link']],
    ],
  },
  {
    id: 'bank_notice_fr',
    label: 'legit_normal',
    language: 'fr',
    format: 'sms',
    merchant: 'PROPERTY',
    refPrefix: 'SO',
    tags: ['bank_name'],
    templates: [
      ['{bank} : votre ordre permanent de {amount} en faveur de {merchant} sera exécuté le {date}. Aucune action n’est requise.', ['amount']],
      ['{bank} : nous ne vous demanderons jamais votre code PIN ou votre mot de passe. Ne les communiquez à personne.', ['credential_mention', 'security_wording']],
    ],
  },
  {
    id: 'reminder_mfe',
    label: 'legit_normal',
    language: 'mfe',
    format: 'sms',
    merchant: 'UTILITY',
    refPrefix: 'ACC',
    tags: ['amount', 'reference'],
    templates: [
      ['{merchant}: enn ti rapel ki ou faktir {ref} pou {amount} bizin peye avan {date}.', ['deadline']],
      ['{merchant}: nou finn resevwar ou peyman {amount} pou kont {ref}. Mersi ou konfians.', []],
      ['{bank}: zame nou pa pou demann ou kod PIN ou ou modpas. Pa donn personn sa bann kod-la.', ['bank_name', 'credential_mention', 'security_wording']],
    ],
  },

  // ---- legit_unusual -----------------------------------------------------
  {
    id: 'overdue_urgent',
    label: 'legit_unusual',
    language: 'en',
    format: 'email',
    merchant: 'TELECOM',
    refPrefix: 'INV',
    tags: ['amount', 'reference', 'urgency', 'threat'],
    templates: [
      ['URGENT – {merchant}: invoice {ref} ({amount}) is now 30 days overdue. Please settle it immediately to avoid suspension of your service. If you have already paid, send us your proof of payment.', ['deadline']],
      ['Final notice from {merchant}: your account {ref} will be blocked on {date} unless the outstanding {amount} is paid. Pay through your usual internet banking.', ['deadline']],
    ],
  },
  {
    id: 'verified_account_change',
    label: 'legit_unusual',
    language: 'en',
    format: 'letter',
    merchant: 'PROPERTY',
    refPrefix: 'UNIT',
    tags: ['changed_details', 'bank_name', 'callback_official'],
    templates: [
      ['{merchant} is moving its account to {bank}. From {date}, contributions for unit {ref} should go to the new account. Before changing anything, please call our office on the number printed on your last statement to confirm. We will never ask you to change details by email alone.', ['deadline']],
      ['Following the general meeting, the syndic account of {merchant} has changed to {bank}. The new details were handed out at the meeting and are posted in the lobby. Please verify them in person with the syndic before updating your standing order.', []],
    ],
  },
  {
    id: 'new_supplier',
    label: 'legit_unusual',
    language: 'en',
    format: 'email',
    merchant: 'SERVICES',
    refPrefix: 'INV',
    tags: ['new_payee', 'amount', 'reference', 'bank_name'],
    templates: [
      ['This is {merchant}, your new maintenance contractor from {date}, as agreed with the residents committee. First invoice {ref} for {amount} attached. Payment to our {bank} account ending in {last4}.', []],
      ['Welcome to {merchant}. Your first monthly fee of {amount} (ref {ref}) is due on {date}. Our {bank} details are on the contract you signed.', ['deadline']],
    ],
  },
  {
    id: 'new_device_alert',
    label: 'legit_unusual',
    language: 'en',
    format: 'sms',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['bank_name', 'security_wording', 'link'],
    templates: [
      ['{bank}: a login to your online banking from a new device on {date} at {time}. If this was you, no action is needed. If not, call the number on the back of your card or see {bankUrl}.', ['callback_official']],
      ['{bank} security: your account was temporarily frozen after an unusual transaction. Please verify it in the {bank} app or at any branch. Information: {bankUrl}.', ['threat']],
    ],
  },
  {
    id: 'staged_payment',
    label: 'legit_unusual',
    language: 'en',
    format: 'email',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['amount', 'multiple_amounts', 'reference'],
    templates: [
      ['{merchant}: deposit of {amount} for the renovation works, as per quote {ref}. The balance of {amount2} is due on completion, expected around {date}.', ['deadline']],
      ['As discussed on site, {merchant} needs an advance of {amount} for materials before work starts on {date}. The remaining {amount2} is payable on completion. Quote {ref}.', []],
    ],
  },
  {
    id: 'private_sale',
    label: 'legit_unusual',
    language: 'en',
    format: 'chat',
    merchant: 'RETAIL',
    refPrefix: 'REF',
    tags: ['new_payee', 'amount'],
    templates: [
      ['Hi, for the second-hand fridge we viewed on Saturday, the price is {amount} as agreed. You can transfer it to my account ending in {last4} and collect on {date}.', []],
      ['Payment of {amount} for the used car as agreed at the viewing. Please transfer before collection on {date}; I will hand over the documents in person.', []],
    ],
  },
  {
    id: 'notice_fr',
    label: 'legit_unusual',
    language: 'fr',
    format: 'letter',
    merchant: 'INSURANCE',
    refPrefix: 'POL',
    tags: ['reference'],
    templates: [
      ['Suite à la fusion de nos services, les règlements des contrats {merchant} seront désormais traités par notre siège. Vos coordonnées bancaires restent inchangées. Référence client : {ref}.', ['changed_details']],
      ['URGENT : votre contrat {ref} chez {merchant} expire le {date}. Pour éviter une interruption de couverture, merci de régler la prime de {amount} dès que possible.', ['urgency', 'amount', 'deadline']],
    ],
  },
  {
    id: 'syndic_mfe',
    label: 'legit_unusual',
    language: 'mfe',
    format: 'chat',
    merchant: 'PROPERTY',
    refPrefix: 'UNIT',
    tags: ['amount'],
    templates: [
      ['{merchant}: kontribisyon spesial {amount} pou travay lasansër, desid dan reinion {date}. Peye lor kont sindik kouma dabitid, referans {ref}.', ['reference']],
      ['{merchant}: irzans! Kontribisyon {amount} bizin peye avan {date} akoz reparasion twatir. Kont pa finn sanze.', ['urgency', 'deadline']],
    ],
  },

  // ---- suspicious --------------------------------------------------------
  {
    id: 'changed_details_unverified',
    label: 'suspicious',
    language: 'en',
    format: 'email',
    merchant: 'TRADING',
    refPrefix: 'INV',
    tags: ['changed_details', 'account_number', 'amount', 'reference'],
    templates: [
      ['Please note that our bank details have changed. Kindly make all future payments, including invoice {ref} ({amount}), to our new account {account} at {bank}.', ['bank_name']],
      ['Update: {merchant} now receives payments at {bank}, account {account}. Please amend your records before paying invoice {ref} of {amount}.', ['bank_name']],
    ],
  },
  {
    id: 'pressure_payment',
    label: 'suspicious',
    language: 'en',
    format: 'email',
    merchant: 'TRADING',
    refPrefix: 'INV',
    tags: ['urgency', 'amount'],
    templates: [
      ['Kindly process a payment of {amount} to {merchant} today before {time}. The director is travelling and needs this settled urgently. The invoice will follow.', ['no_invoice']],
      ['We need {amount} paid to {merchant} within 2 hours to hold the shipment. Paperwork to follow tomorrow.', ['no_invoice']],
    ],
  },
  {
    id: 'unfamiliar_link',
    label: 'suspicious',
    language: 'en',
    format: 'email',
    merchant: 'SERVICES',
    refPrefix: 'INV',
    tags: ['link', 'unfamiliar_link', 'reference'],
    templates: [
      ['Your invoice {ref} is ready. View and pay here: {neutralUrl}', []],
      ['{merchant} has shared a payment document with you ({ref}). Open it at {neutralUrl} to review the amount of {amount}.', ['amount']],
    ],
  },
  {
    id: 'new_number_family',
    label: 'suspicious',
    language: 'en',
    format: 'chat',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['contact_change', 'new_payee', 'amount', 'urgency'],
    templates: [
      ["Hi, it's me, I lost my phone and this is my new number. Can you send {amount} to my friend's account ending in {last4} today? I'll explain later.", []],
      ['Hello, new number, old one broke. I need {amount} for the electricity bill before tonight, please send to account {account}. Will pay you back Friday.', ['account_number']],
    ],
  },
  {
    id: 'overpayment_refund',
    label: 'suspicious',
    language: 'en',
    format: 'email',
    merchant: 'RETAIL',
    refPrefix: 'ORD',
    tags: ['refund', 'account_number', 'multiple_amounts', 'amount'],
    templates: [
      ['We received an overpayment of {amount} for order {ref} by mistake. Please return the difference of {amountPart} to account {account} as soon as possible.', ['urgency', 'reference']],
      ['Our system shows a duplicate payment of {amount}. To correct it, transfer {amountPart} back to our refunds account {account}.', []],
    ],
  },
  {
    id: 'extra_verification',
    label: 'suspicious',
    language: 'en',
    format: 'sms',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['bank_name', 'security_wording', 'amount'],
    templates: [
      ['{bank}: to complete your standing order of {amount} we need to verify some details. Reply with a convenient time for a call from our verification team.', []],
      ['{bank}: your transfer of {amount} is on hold pending a security check. Please confirm the payment details at {neutralUrl}.', ['link', 'unfamiliar_link']],
    ],
  },
  {
    id: 'changed_details_fr',
    label: 'suspicious',
    language: 'fr',
    format: 'email',
    merchant: 'TRADING',
    refPrefix: 'INV',
    tags: ['changed_details', 'account_number', 'reference', 'urgency'],
    templates: [
      ['Suite à un changement de banque, merci d’effectuer le règlement de la facture {ref} sur notre nouveau compte {account}. Merci de traiter ce paiement en priorité.', []],
      ['{merchant} vous informe que ses coordonnées bancaires ont changé. Le paiement de {amount} (facture {ref}) doit être fait aujourd’hui sur le compte {account}.', ['amount']],
    ],
  },
  {
    id: 'changed_details_mfe',
    label: 'suspicious',
    language: 'mfe',
    format: 'chat',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['changed_details', 'account_number', 'amount', 'urgency'],
    templates: [
      ['Nou finn sanz nou kont labank. Silvouple fer peyman {amount} lor nouvo kont {account} zordi mem.', []],
      ['{merchant}: kont ki lor faktir pa bon aster. Avoy {amount} lor kont {account} avan {time}.', []],
    ],
  },

  // ---- fraudulent --------------------------------------------------------
  {
    id: 'bank_impersonation_code',
    label: 'fraudulent',
    language: 'en',
    format: 'sms',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['bank_impersonation', 'bank_name', 'credential_request', 'threat', 'urgency'],
    templates: [
      ['{bank} ALERT: unusual activity on your account. To avoid suspension, confirm your identity by replying with the one-time code we just sent you.', []],
      ['{bank}: we blocked a suspicious payment of {amount}. To cancel it, read us the 6-digit code you receive when our agent calls.', ['amount']],
      ['{bank}: for your security, your card will be deactivated today. Reply with your card number and PIN to keep it active.', []],
    ],
  },
  {
    id: 'fake_security_link',
    label: 'fraudulent',
    language: 'en',
    format: 'sms',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['bank_impersonation', 'bank_name', 'lookalike_link', 'link', 'threat'],
    templates: [
      ['{bank}: your online banking access has been restricted. Restore access within 24 hours at {fakeUrl}', ['urgency']],
      ['{bank} notice: please review a pending change to your account profile at {fakeUrl} before {time}.', ['security_wording']],
      ['Your {bank} statement could not be delivered. Update your contact details: {fakeUrl}', []],
    ],
  },
  {
    id: 'payment_redirection',
    label: 'fraudulent',
    language: 'en',
    format: 'email',
    merchant: 'TRADING',
    refPrefix: 'INV',
    tags: ['changed_details', 'account_number', 'amount', 'reference', 'routine_tone'],
    templates: [
      ['Good morning, please find attached invoice {ref} for {amount}. Please note that payments should now be made to account {account}; the account on the invoice is no longer in use. Kind regards, Accounts Department, {merchant}. Sent from {fakeEmail}', ['lookalike_sender']],
      ['Hello, as part of our year-end audit, {merchant} has moved its receivables to a new account. Please settle invoice {ref} ({amount}) to {account} and update your records. Reply to {fakeEmail} with any questions.', ['lookalike_sender']],
    ],
  },
  {
    id: 'safe_account',
    label: 'fraudulent',
    language: 'en',
    format: 'chat',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['bank_impersonation', 'bank_name', 'security_wording', 'bypass_verification', 'account_number', 'secrecy'],
    templates: [
      ['This is the {bank} security team. Your savings are exposed during an internal investigation. Move {amount} to the protected holding account {account} today. Do not discuss this with branch staff, as they may be involved.', ['amount', 'urgency']],
      ['{bank} protection unit: to keep your funds safe while we replace your card, transfer your balance to the temporary account {account}. There is no need to call your branch; we are handling it.', []],
    ],
  },
  {
    id: 'fake_refund',
    label: 'fraudulent',
    language: 'en',
    format: 'email',
    merchant: 'UTILITY',
    refPrefix: 'ACC',
    tags: ['refund', 'link', 'amount'],
    templates: [
      ['{merchant}: you are eligible for a refund of {amount} for an overcharged bill. Claim it at {refundUrl} using your card number and PIN.', ['credential_request']],
      ['Good news from {merchant}: a credit of {amount} is waiting on account {ref}. Enter your banking login at {refundUrl} to receive it.', ['credential_request', 'reference']],
      ['{merchant}: a refund of {amount} could not be paid to your account. Confirm your payment details at {refundUrl} within 48 hours.', ['urgency']],
    ],
  },
  {
    id: 'investment_promise',
    label: 'fraudulent',
    language: 'en',
    format: 'chat',
    merchant: 'INVEST',
    refPrefix: 'REF',
    tags: ['promised_returns', 'account_number', 'amount'],
    templates: [
      ['Join the {merchant} trading club: guaranteed returns every month. Invest {amount} today and receive {amountReturn} in 30 days. Limited places, send to account {account}.', ['urgency', 'multiple_amounts']],
      ['Following our call, please find the subscription details for the {merchant} fixed-income plan. Transfer {amount} to the custodian account {account} by {date} to secure this quarter’s allocation.', ['routine_tone', 'deadline']],
    ],
  },
  {
    id: 'prize_fee',
    label: 'fraudulent',
    language: 'en',
    format: 'sms',
    merchant: 'RETAIL',
    refPrefix: 'REF',
    tags: ['fee_request', 'amount', 'deadline'],
    templates: [
      ['Congratulations! Your number was selected for a shopping voucher from {merchant}. Pay the processing fee of {amount} to account {account} before {date} to claim it.', ['account_number']],
      ['{merchant} anniversary draw: you have won a new television. Delivery requires a customs fee of {amount}, payable at {refundUrl}.', ['link']],
    ],
  },
  {
    id: 'bypass_checks',
    label: 'fraudulent',
    language: 'en',
    format: 'sms',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['bank_impersonation', 'bank_name', 'bypass_verification'],
    templates: [
      ['{bank} customer care: we are upgrading your account today. Approve the request that appears in your app and do not call the branch, or the upgrade will be cancelled.', ['urgency']],
      ['{bank}: a standing order of {amount} was set up for your account protection. It is part of a confidential review, so there is no need to contact your branch.', ['amount', 'secrecy']],
    ],
  },
  {
    id: 'executive_request',
    label: 'fraudulent',
    language: 'en',
    format: 'email',
    merchant: 'TRADING',
    refPrefix: 'INV',
    tags: ['secrecy', 'urgency', 'new_payee', 'account_number', 'amount', 'routine_tone'],
    templates: [
      ['Hi, I need you to process a confidential supplier payment of {amount} to {merchant}, account {account}, before end of day. Please keep this between us until the deal is announced.', []],
      ['I am in meetings all day. Please pay {merchant} {amount} to account {account} this morning and send me the confirmation only. I will sign the paperwork on Monday.', []],
    ],
  },
  {
    id: 'impersonation_fr',
    label: 'fraudulent',
    language: 'fr',
    format: 'sms',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['bank_impersonation', 'bank_name', 'threat', 'lookalike_link', 'link'],
    templates: [
      ['{bank} : votre compte sera suspendu aujourd’hui. Pour éviter la suspension, confirmez vos informations sur {fakeUrl} avec votre code de sécurité.', ['credential_request', 'urgency']],
      ['{bank} : un paiement de {amount} est en attente. Si vous n’êtes pas à l’origine de cette opération, annulez-la sur {fakeUrl}.', ['amount']],
    ],
  },
  {
    id: 'redirection_fr',
    label: 'fraudulent',
    language: 'fr',
    format: 'email',
    merchant: 'TRADING',
    refPrefix: 'INV',
    tags: ['changed_details', 'account_number', 'reference', 'routine_tone'],
    templates: [
      ['Veuillez trouver ci-joint la facture {ref}. Nos coordonnées bancaires ayant été mises à jour, merci de régler {amount} sur le compte {account}. Service comptabilité, {merchant}.', ['amount']],
    ],
  },
  {
    id: 'impersonation_mfe',
    label: 'fraudulent',
    language: 'mfe',
    format: 'sms',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['bank_impersonation', 'bank_name'],
    templates: [
      ['{bank}: ou kont inn bloke. Pou debloke li, avoy nou kod OTP ki ou pou resevwar lor ou portab.', ['credential_request', 'threat']],
      ['{bank}: nou finn trouv enn problem lor ou kont. Rant lor {fakeUrl} pou verifie ou detay zordi mem.', ['lookalike_link', 'link', 'urgency']],
    ],
  },
  {
    id: 'redirection_mfe',
    label: 'fraudulent',
    language: 'mfe',
    format: 'chat',
    merchant: 'SERVICES',
    refPrefix: 'REF',
    tags: ['changed_details', 'account_number', 'bypass_verification'],
    templates: [
      ['{merchant}: nou finn sanz kont. Tou peyman aster al lor kont {account}. Pa bizin telefonn biro, tou korek.', []],
    ],
  },
]

// --- Slot values ------------------------------------------------------------

const slugify = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const withCommas = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function formatAmount(rng, value) {
  return rng.pick([`Rs ${withCommas(value)}`, `Rs ${withCommas(value)}`, `MUR ${withCommas(value)}`, `Rs${withCommas(value)}`, `MUR ${value}.00`, `Rs ${withCommas(value)}.00`])
}

function slotValues(rng, scenario) {
  const bank = rng.pick(BANKS)
  const merchant = `${rng.pick(NAME_STEMS)} ${rng.pick(MERCHANT_SUFFIXES[scenario.merchant])}`
  const merchantSlug = slugify(merchant)
  const amount = rng.int(8, 900) * rng.pick([10, 50, 100])
  let amount2 = rng.int(8, 900) * rng.pick([10, 50, 100])
  if (amount2 === amount) amount2 += 500
  const roundTo10 = (value) => Math.max(10, Math.round(value / 10) * 10)
  const pad = (n) => String(n).padStart(2, '0')
  const lookalikes = [
    `https://${bank.slug}-secure-login${SYNTHETIC_DOMAIN_SUFFIX}/verify`,
    `https://${bank.slug}.account-review${SYNTHETIC_DOMAIN_SUFFIX}/restore`,
    `https://secure-${bank.slug}-banking${SYNTHETIC_DOMAIN_SUFFIX}/login`,
    `https://${bank.slug}-online-${rng.hex(4)}${SYNTHETIC_DOMAIN_SUFFIX}`,
  ]
  return {
    bank: bank.name,
    merchant,
    amount: formatAmount(rng, amount),
    amount2: formatAmount(rng, amount2),
    // A promised payout larger than {amount}, and a part of {amount}.
    amountReturn: formatAmount(rng, roundTo10(amount * rng.float(1.3, 1.8))),
    amountPart: formatAmount(rng, roundTo10(amount * rng.float(0.2, 0.6))),
    ref: `${scenario.refPrefix}-${rng.pick(['2026-', ''])}${rng.digits(rng.int(4, 5))}`,
    date: `${pad(rng.int(1, 28))}/${pad(rng.int(10, 12))}/2026`,
    time: rng.pick(['12:00', '15:00', '16:30', '17:00', '18:00']),
    last4: rng.digits(4),
    account: `${SYNTHETIC_ACCOUNT_PREFIX}${rng.digits(6)}`,
    url: `https://www.${merchantSlug}${SYNTHETIC_DOMAIN_SUFFIX}/${rng.pick(['billing', 'account', 'orders', 'pay'])}`,
    bankUrl: `https://www.${bank.slug}${SYNTHETIC_DOMAIN_SUFFIX}/security`,
    fakeUrl: rng.pick(lookalikes),
    neutralUrl: `https://${rng.pick(['docs-share', 'invoice-view', 'pay-portal', 'file-drop'])}-${rng.hex(4)}${SYNTHETIC_DOMAIN_SUFFIX}/${rng.hex(6)}`,
    refundUrl: `https://${rng.pick(['refund-centre', 'claims-desk', 'rebate-portal'])}-${rng.hex(4)}${SYNTHETIC_DOMAIN_SUFFIX}/claim`,
    fakeEmail: `accounts.${merchantSlug}@${rng.pick(['mail-box', 'inbox-secure', 'webmail-pro'])}-${rng.hex(3)}${SYNTHETIC_DOMAIN_SUFFIX}`,
  }
}

function fill(template, slots, scenarioId) {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in slots)) throw new Error(`Unknown slot {${name}} in scenario ${scenarioId}`)
    return slots[name]
  })
}

// --- Generation -------------------------------------------------------------

export function resolveMessageConfig(overrides = {}) {
  const config = { ...DEFAULT_MESSAGE_CONFIG, ...overrides, counts: { ...DEFAULT_MESSAGE_CONFIG.counts, ...overrides.counts } }
  for (const label of Object.keys(config.counts)) if (!MESSAGE_LABELS.includes(label)) throw new Error(`Unknown label in counts: ${label}`)
  for (const label of MESSAGE_LABELS) {
    if (!Number.isInteger(config.counts[label]) || config.counts[label] < 0) throw new Error(`counts.${label} must be a non-negative integer`)
  }
  return config
}

function buildRecord(rng, scenario, index) {
  const [template, extraTags] = rng.pick(scenario.templates)
  const slots = slotValues(rng, scenario)
  const body = fill(template, slots, scenario.id)
  // Emails and letters may get a greeting line and a sign-off, unless the
  // template already has its own.
  const framed = scenario.format === 'email' || scenario.format === 'letter'
  const opener = framed && !GREETING.test(body) ? rng.pick(OPENERS[scenario.language]) : ''
  const closer = framed && !SIGN_OFF.test(body) ? rng.pick(CLOSERS[scenario.language]) : ''
  return {
    id: `SYN-MSG-${String(index + 1).padStart(5, '0')}`,
    text: `${opener ? `${opener}\n` : ''}${body}${closer ? `\n${closer}` : ''}`,
    label: scenario.label,
    scenario: scenario.id,
    language: scenario.language,
    format: scenario.format,
    patternTags: [...new Set([...scenario.tags, ...extraTags])].sort(),
  }
}

export function summarizeMessageCorpus(records) {
  const tally = (key) => {
    const counts = {}
    for (const record of records) for (const value of [].concat(record[key])) counts[value] = (counts[value] ?? 0) + 1
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
  }
  const byLabel = Object.fromEntries(MESSAGE_LABELS.map((label) => [label, records.filter((record) => record.label === label).length]))
  return { records: records.length, byLabel, byScenario: tally('scenario'), byLanguage: tally('language'), byFormat: tally('format'), byTag: tally('patternTags') }
}

// Generates the corpus. Within each label, records cycle through its
// scenarios in turn, so every scenario is represented; the order is then
// shuffled so labels are interleaved. Each record draws from its own forked
// stream, so the same seed always gives the same corpus.
export function generateMessageCorpus(overrides = {}) {
  const config = resolveMessageConfig(overrides)
  const rng = createRng(config.seed)
  const planned = MESSAGE_LABELS.flatMap((label) => {
    const scenarios = SCENARIOS.filter((scenario) => scenario.label === label)
    return Array.from({ length: config.counts[label] }, (_, i) => scenarios[i % scenarios.length])
  })
  const records = rng.shuffle(planned).map((scenario, index) => buildRecord(rng.fork(`message-${index}`), scenario, index))
  return { version: MESSAGE_CORPUS_VERSION, config, records, summary: summarizeMessageCorpus(records) }
}

export const MESSAGE_SCENARIOS = SCENARIOS.map(({ id, label, language, format }) => ({ id, label, language, format }))
