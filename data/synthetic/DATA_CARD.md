# Data card: fraud.auth synthetic standing-order dataset

> **This dataset is entirely synthetic.** Every user, payee, account, device and
> transaction in it was produced by a program. It is not real banking data or
> customer data, it is not derived from any, and it must not be presented as if it
> were. It says nothing about how often fraud happens in the real world.

| | |
|---|---|
| Purpose | Train and evaluate the future machine-learning component of fraud.auth's standing-order risk scoring |
| Records | One pending standing-order request per record (default 2,000 records, 200 users) |
| Setting | A fictional Mauritian retail bank; amounts in MUR, times in `Indian/Mauritius` |
| Generator | `src/fraud/synthetic/` (version recorded in `manifest.json`) |
| Regenerate | `npm run data:generate` (see [Regenerating](#regenerating-the-dataset)) |
| Status | Prototype / training resource for Stage 2 |

## Why synthetic data

fraud.auth needs labelled examples of standing-order requests, both genuine and
fraudulent, to build a model that produces *dynamic* risk scores rather than
picking between a few fixed outcomes. Real labelled bank fraud data is not
available to this project and, where it exists, is confidential and subject to
data-protection law. Synthetic data lets us:

- build and test the full feature → model → score pipeline end to end;
- control which behaviour patterns appear, including rare and ambiguous ones;
- include deliberate counterexamples (unusual but genuine requests) so a model
  cannot learn the shortcut "unusual = fraud";
- share and regenerate the data freely, because nobody's information is in it.

The trade-off is that the data only contains the patterns we wrote into the
generator (see [Limitations](#limitations)).

## Relationship to the app and its demo cases

The app's three demo requests (the scenarios scoring 100 / 69 / 8 in the
rule engine) are presentation cases only. They are **not** in this dataset,
their names are not used as labels, none of their payees are reused, and their
scores are not targets. Tests check that the demo labels and payees never appear.

What the dataset does share with the app is its *machinery*:

- Each synthetic user's history is a ledger in the app's own transaction
  shape, and their behavioural baseline is computed by the same
  `deriveUserProfile` (`src/fraud/profile.js`) the app uses for a real account.
- Features are computed by `extractFeatures` (`src/fraud/features.js`), which
  also works on the app's pending requests. A model trained here therefore sees
  features computed exactly as they would be in the app.
- The existing rule engine (`src/fraud/engine.js`) is run on every record and its
  score stored as a **benchmark** column, for comparing a future model against
  the rules. It is not a feature and not a label.

## How the data is generated

```
persona  ──►  ledger history  ──►  deriveUserProfile  ──►  behavioural baseline
                                                                 │
scenario (risk class + pattern) ──►  pending standing-order request
                                                                 │
                           extractFeatures (request, history, baseline)
                                                                 │
                     record = ids + raw features + derived features + labels
```

1. **Users.** Each user gets a *persona* from one of four segments
   (young professional, family household, retiree, small-business owner) with
   latent habits: monthly income, payday, the hours they usually bank, one to
   three devices, a usual channel (online banking or mobile app), two to seven
   standing orders, some bill-payment and transfer payees, and card merchants.
2. **History.** The persona is played out over `historyMonths` (default 6)
   before `referenceDate`: monthly or weekly standing-order payments, card
   payments, bill payments, transfers and a monthly salary credit. Amounts are
   scaled to the user's income; transaction times fall within their active hours.
3. **Baseline.** `deriveUserProfile` turns that ledger into the user's baseline:
   average amount, standing-order amount range, usual payment days and hours,
   known devices, usual channel, known payees and existing arrangements.
4. **Requests.** Each record is assigned a risk class (in exact configured
   proportions, then shuffled), a random user and a scenario from that class.
   The scenario builds a standing-order request — payee, amount, frequency,
   first payment date, time, device, channel, when the payee was added, and
   wording — relative to that user's persona and baseline. Requests are
   submitted over the `requestWindowDays` (default 30) after `referenceDate`.
5. **Features.** `extractFeatures` computes raw and derived features.
6. **Validation.** Every record is checked against the schema
   (`src/fraud/synthetic/schema.js`) before anything is written.

All randomness comes from a seeded generator (`random.js`). Each user and each
record has its own stream derived from the seed, so the same configuration always
reproduces the same dataset byte for byte.

### Fictional content

- Users are identified only as `SYN-U00001`…; there are no names, addresses,
  phone numbers, e-mail addresses, ID numbers or dates of birth.
- Payee names are assembled from generic words (Mauritian flora, fauna and
  coastline terms plus a business suffix, e.g. "Filao Fibre Ltd"). Any
  resemblance to a real business is coincidental. Individuals are never named;
  personal payees appear as "Family account ••1234".
- Account numbers are random four-digit suffixes; device IDs are random hex.
- Links in scam wording use the reserved `.example` domain.

Tests scan the whole dataset for personal-data fields, e-mail addresses, long
digit runs (phone, card or account numbers) and non-`.example` links.

## Labels

Each record has three label fields, kept apart from the features:

| Field | Meaning |
|---|---|
| `isFraud` | Ground truth *in the synthetic world*: was this request fraud? |
| `riskClass` | Which of the four generation classes produced the record. |
| `scenario` | The specific generation pattern within that class. |

`riskClass` values:

| Class | Meaning | `isFraud` |
|---|---|---|
| `legit_normal` | Consistent with the user's established behaviour. | always false |
| `legit_unusual` | Genuine but unusual for this user: one or two departures from the norm (large amount, new device, late at night, new payee, urgent wording…). | always false |
| `suspicious` | Several risk signals; fraud is not certain. | drawn per record with probability `suspiciousFraudShare` (default 0.35) |
| `fraudulent` | Combinations of strong indicators following a known scam pattern. | always true |

For `suspicious` records whose drawn outcome is fraud, the generator adds one
extra weak signal half of the time, so the two outcomes overlap heavily but are
not identical. This is intended: the future model should give such cases an
intermediate probability rather than a confident answer.

**Use `isFraud` as the training target.** `riskClass` and `scenario` describe
how a record was generated; they are useful for stratified splits, per-pattern
error analysis and checking the model on hard cases, but they must never be used
as input features (they would leak the answer).

### Scenarios

| Scenario | Class | Pattern |
|---|---|---|
| `routine_existing_payee` | `legit_normal` | Renews or re-creates an existing standing order: same payee, near-identical amount, usual day, time, device and channel. |
| `routine_known_biller` | `legit_normal` | Moves a payee the user already pays by bill payment or transfer onto a monthly standing order at their usual amount. |
| `new_payee_everyday` | `legit_normal` | A new everyday payee (gym, internet, insurance…) added days or weeks earlier, at an amount inside the user's usual range, set up in the usual way. |
| `amount_adjustment` | `legit_normal` | An existing standing order re-issued with a modest price increase (5–25%). |
| `large_payment_known_payee` | `legit_unusual` | A much larger payment than usual (annual premium, arrears, deposit) to a payee the user already pays, set up in the usual way. |
| `new_device_routine` | `legit_unusual` | A routine standing order to an existing payee, set up from a phone or laptop the account has not used before. |
| `late_night_routine` | `legit_unusual` | A routine standing order to an existing payee set up in the middle of the night, outside the user's usual banking hours. |
| `new_payee_large_planned` | `legit_unusual` | A new payee for a planned, larger commitment (school fees, car lease, rent), added days in advance and set up from a known device. |
| `frequency_restructure` | `legit_unusual` | An existing monthly payment switched to weekly instalments of the same yearly total. |
| `payment_day_moved` | `legit_unusual` | An existing payment moved to a day of the month the user does not normally pay on (e.g. a new salary date). |
| `branch_setup` | `legit_unusual` | A new payee added and paid by standing order in person at a branch, rather than through the user's usual digital channel. |
| `urgent_wording_legit` | `legit_unusual` | A genuine payment whose note uses urgent wording ("today", "before 15:00") — pressure language without a scam. |
| `recent_beneficiary_everyday` | `legit_unusual` | A new everyday payee added minutes before the standing order, at a normal amount from a known device. |
| `mixed_reference_legit` | `legit_unusual` | An existing payee paid under a reference that names a different kind of service (a property manager also billing garden upkeep). |
| `changed_account_details` | `suspicious` | An existing payee's name with a different account number, following a "bank details have changed" message. Genuine account changes and redirection scams look alike. |
| `lookalike_payee` | `suspicious` | A new payee whose name closely resembles an existing one ("Ltd" vs "Limited", one changed letter), at the existing amount. |
| `weak_signal_combo` | `suspicious` | A new payee plus two or three individually weak departures (somewhat higher amount, edge-of-hours, off-cycle day, recent beneficiary, new device). |
| `new_payee_new_device` | `suspicious` | A new payee set up from an unrecognised device at a moderately elevated amount. |
| `mild_pressure_wording` | `suspicious` | A new payee for a deposit or booking with mild time-pressure wording, otherwise set up normally. |
| `frequency_spike` | `suspicious` | A new payee paid weekly or daily — a schedule the user does not use — in small individual amounts. |
| `bank_impersonation` | `fraudulent` | The user is talked into paying a security-themed "safe account" by someone posing as the bank: new payee, large amount, pressure wording, often via an emailed link. |
| `account_takeover` | `fraudulent` | Someone else in control of the account: unrecognised device, often at night, payee added minutes earlier, large amount to a personal or shell account, bland wording. |
| `invoice_redirection` | `fraudulent` | A known supplier impersonated — same or look-alike name, new account, raised amount, "updated bank details" wording, sometimes a mismatched reference. |
| `investment_scam` | `fraudulent` | The user, on their own device and at their usual time, sets up large payments to a fake investment scheme promising returns. |
| `frequency_drain` | `fraudulent` | Many smaller daily or weekly payments to a new payee, draining far more per year than the user's usual commitments. |
| `mimic_routine` | `fraudulent` | Dressed up as a routine bill — monthly, usual payment day, usual hours, business-like name and wording — but a brand-new payee at several times the usual amount, added shortly before. |
| `weak_signal_stack` | `fraudulent` | No single strong indicator, but four or five weak ones at once (higher amount, edge hours, off-cycle day, new device, recent beneficiary, odd schedule, pressure wording, overseas bank). |

## Features

Features are split into **raw** values (observed on the request, or counted from
the user's history, untransformed) and **derived** values (ratios, flags and
scores computed from the raw ones). The derived features give the model clean
inputs; the raw ones let later stages engineer their own. For example:

| Raw | Derived |
|---|---|
| `amount` = 12000, `userAverageAmount` = 2500 | `amountToUserAverageRatio` = 4.8 |
| `recipientPreviouslyUsed` = false | `newRecipient` = true |
| `initiatedHour` = 2, `userActiveHourStart`–`userActiveHourEnd` = 8–21 | `unusualHour` = true, `hoursOutsideActiveWindow` = 6 |

Nullable fields are `null` when the history cannot support a value (for example
`recipientHistoricalAverageAmount` for a payee never paid before).

### Identifiers

| Field | Meaning |
|---|---|
| `standingOrderId` | Synthetic request ID (`SYN-SO-000001`…). |
| `userId` | Synthetic user ID; links to `users.json`. |

### Raw features

| Feature | Type | Meaning |
|---|---|---|
| `amount` | number | Amount per payment, MUR. |
| `currency` | category | Always MUR. |
| `frequency` | category | Payment schedule. |
| `recipient` | string | Payee name as entered (fictional). |
| `recipientAccount` | string, nullable | Last four digits of the payee account (fictional). |
| `recipientBank` | category, nullable | Where the payee account is held. |
| `channel` | category, nullable | Channel the request was made through. |
| `deviceId` | string, nullable | Opaque ID of the device used; null for branch requests. |
| `initiatedAt` | datetime | When the request was submitted (ISO 8601, UTC). |
| `initiatedHour` | integer | Hour of submission, Mauritius time (0–23). |
| `initiatedDayOfWeek` | integer | Day of week of submission, Mauritius time (1 = Monday … 7 = Sunday). |
| `firstPaymentDate` | datetime | Requested date of the first payment (ISO 8601, UTC). |
| `firstPaymentDayOfMonth` | integer | Day of month of the first payment, Mauritius time. |
| `firstPaymentDayOfWeek` | integer | Day of week of the first payment (1 = Monday). |
| `beneficiaryAddedMinutesBefore` | integer, nullable | Minutes between the payee being added (or its details changed) and the request; null for payees on file. |
| `description` | string | Short description the user chose for the payment. |
| `paymentReference` | string, nullable | Payment reference, e.g. a policy or invoice number. |
| `requestText` | string | Free-text note or message attached to the request; often empty. |
| `userBaselineTransactionCount` | integer | Settled outgoing transactions in the user's history. |
| `userAverageAmount` | number, nullable | Mean amount of those transactions, MUR. |
| `userTransactionsPer30Days` | number | Transaction frequency: baseline transactions per 30 days. |
| `userStandingOrderCount` | integer | Payees the user already pays by standing order. |
| `userStandingOrderMinAmount` | number, nullable | Smallest existing standing-order payment, MUR. |
| `userStandingOrderMaxAmount` | number, nullable | Largest existing standing-order payment, MUR. |
| `userUsualFrequencies` | list | Frequencies of the user's existing standing orders. |
| `userPaymentDays` | list | Days of the month existing standing orders are paid on. |
| `userActiveHourStart` | integer, nullable | Start of the user's usual banking hours (inclusive), from history. |
| `userActiveHourEnd` | integer, nullable | End of the user's usual banking hours (exclusive). |
| `userKnownDeviceCount` | integer | Devices seen in the user's history. |
| `userUsualChannel` | category, nullable | Channel the user most often banks through. |
| `recipientPreviouslyUsed` | boolean | The payee name appears in the user's history. |
| `recipientPreviousPaymentCount` | integer | Earlier payments to this payee. |
| `recipientHistoricalAverageAmount` | number, nullable | Mean earlier payment to this payee, MUR. |
| `recipientLastPaidDaysAgo` | number, nullable | Days since the payee was last paid. |
| `recipientAccountPreviouslyUsed` | boolean, nullable | For a known payee, whether this account number was paid before; null when not comparable. |
| `existingStandingOrderToRecipient` | boolean | The user already pays this payee by standing order. |
| `existingStandingOrderAmount` | number, nullable | Amount of that existing order, MUR. |
| `existingStandingOrderFrequency` | category, nullable | Frequency of that existing order. |
| `existingStandingOrderDayOfMonth` | integer, nullable | Payment day of that existing order. |

### Derived features

| Feature | Type | Meaning |
|---|---|---|
| `amountLog10` | number | log10 of the amount. |
| `amountToUserAverageRatio` | number, nullable | Amount ÷ user's average transaction. |
| `amountToStandingOrderMaxRatio` | number, nullable | Amount ÷ user's largest existing standing order. |
| `amountLogZScore` | number, nullable | Standard score of log(amount) against the user's transaction amounts. |
| `amountToRecipientAverageRatio` | number, nullable | Amount ÷ average earlier payment to this payee. |
| `amountChangeVsExistingOrderRatio` | number, nullable | Amount ÷ the existing standing order to this payee. |
| `amountAboveUsualRange` | boolean | Amount exceeds the user's largest existing standing order. |
| `roundThousandAmount` | boolean | Amount is a whole multiple of Rs 1,000. |
| `paymentsPerYear` | integer | Payments per year implied by the frequency. |
| `annualisedAmount` | number | Amount × payments per year, MUR. |
| `annualisedToUsualRatio` | number, nullable | Annualised amount ÷ (largest existing standing order × 12). |
| `unusualFrequency` | boolean | Frequency not among the user's existing standing orders. |
| `frequencyChangedForRecipient` | boolean | Differs from the frequency of the existing order to this payee. |
| `duplicateOfExistingOrder` | boolean | Same payee, amount and frequency as an existing order. |
| `newRecipient` | boolean | Payee never paid before (negation of recipientPreviouslyUsed). |
| `recipientAccountChanged` | boolean | Known payee name, account number never used before. |
| `recipientNameSimilarity` | number | Highest 0–1 name similarity to a *different* known payee. |
| `lookalikeRecipient` | boolean | New payee whose name is ≥ 0.8 similar to a known payee. |
| `securityThemedRecipientName` | boolean | Payee name uses security/settlement wording ("Secure", "Escrow", "Protection"…). |
| `overseasRecipient` | boolean | Payee account is held overseas. |
| `beneficiaryAddedRecently` | boolean | Payee added or changed less than 24 hours before the request. |
| `unusualHour` | boolean | Submitted outside the user's usual banking hours. |
| `hoursOutsideActiveWindow` | integer | Hours between submission and the nearest edge of the usual window (0 if inside). |
| `nightTime` | boolean | Submitted between 00:00 and 04:59. |
| `hourTypicality` | number, nullable | Share of the user's history initiated within ±1 hour of this hour. |
| `unusualPaymentDay` | boolean | First payment day more than two days from any existing payment day. |
| `weekendInitiation` | boolean | Submitted on a Saturday or Sunday. |
| `newDevice` | boolean | Device not seen in the user's history. |
| `unusualChannel` | boolean | Channel differs from the user's usual channel. |
| `externalLinkChannel` | boolean | Request came through a link in an email. |
| `textLength` | integer | Characters in requestText. |
| `textUrgency` | boolean | requestText contains urgency wording. |
| `textThreat` | boolean | requestText threatens consequences (suspension, freeze…). |
| `textBypassChecks` | boolean | requestText asks the user not to contact or verify with the bank. |
| `textExternalLink` | boolean | requestText contains a link or web address. |
| `textSensitiveInfo` | boolean | requestText asks for an OTP, PIN, password or card details. |
| `textBankImpersonation` | boolean | requestText claims to come from the bank's security team. |
| `textChangedPaymentDetails` | boolean | requestText says payment/bank details have changed. |
| `textPromisedReturns` | boolean | requestText promises returns or profits. |
| `textRiskTermCount` | integer | Number of the text flags above that are true. |
| `payeeCategory` | category, nullable | Kind of payee, from its known relationship or its name. |
| `referenceCategory` | category, nullable | Kind of service named by the description and reference. |
| `referencePayeeConflict` | boolean | payeeCategory and referenceCategory are both known and differ. |
| `riskSignalCount` | integer | How many departure-from-normal flags are set (see RISK_SIGNAL_FLAGS in features.js). |

Text features reuse the rule engine's own language patterns (`LANGUAGE_PATTERNS`
in `checks.js`) plus two extra patterns; the raw `requestText`,
`description` and `paymentReference` are kept for the future NLP component.

### Benchmark columns

| Field | Meaning |
|---|---|
| `ruleEngineScore` | The existing rule engine's 0–100 safety score for the request (higher = safer). |
| `ruleEngineRiskLevel` | Its band: `LOW`, `MEDIUM` or `HIGH`. |

These are for comparison only. Do not train on them or treat them as targets.
In the default dataset the rule engine rates only 57 of 160 fraudulent requests
`HIGH`, and rates changed-account-detail redirections as safe (median score 95) because
the rules cannot see account numbers. That gap is what the ML stage is for.

## Files

Written to `data/synthetic/generated/` by default. This directory is not committed
(it is in `.gitignore`); run `npm run data:generate` to create it.

| File | Contents |
|---|---|
| `standing-orders.jsonl` | One record per line: `standingOrderId`, `userId`, `raw`, `derived`, `labels`, `benchmark`. |
| `standing-orders.csv` | The same records flattened: ids, raw, derived, then `label_*` and `benchmark_*` columns. Booleans are `1`/`0`, nulls are empty, lists are `\|`-separated. |
| `users.json` | Each user's derived behavioural `baseline` (average amount, normal amount range, usual payment days and hours, devices, channel, common recipients, transaction frequency, existing standing orders) and latent `persona`. |
| `schema.json` | Machine-readable field definitions and scenario descriptions. |
| `manifest.json` | Config, seed, generator version and class/scenario counts. |
| `history.jsonl`, `requests.jsonl` | Only with `--with-history`: each user's full ledger and the app-shaped requests the records were extracted from. |

When splitting for training, split **by user** (`userId`) as well as by record,
so the model is tested on people it has not seen.

## Default composition

With the default configuration (seed `fraud-auth-stage2`, 200 users, 2,000
records):

| Class | Records | Share |
|---|---|---|
| `legit_normal` | 1,200 | 60% |
| `legit_unusual` | 400 | 20% |
| `suspicious` | 240 | 12% (87 labelled fraud) |
| `fraudulent` | 160 | 8% |
| **Labelled fraud overall** | **247** | **12.35%** |

**These proportions are a design choice, not a measurement.** Real standing-order
fraud is far rarer than 12%; the dataset over-samples fraud and hard cases so a
model has enough examples to learn from. Any real deployment would need to
recalibrate scores to real prevalence.

## Assumptions

- A user's past behaviour is a meaningful baseline, and fraud tends to depart from it.
- Fraud usually shows as a *combination* of signals; single signals are common
  in genuine activity.
- The scam patterns modelled (bank impersonation, account takeover, invoice
  redirection, investment scams, payment draining, disguised routine payments,
  stacked weak signals) are representative of authorised-push-payment and
  account-takeover fraud as commonly described; their relative frequencies here
  are arbitrary.
- Payment behaviour is independent between users; there are no fraud rings or
  shared mule accounts across users.
- Mauritius has a single time zone with no daylight saving, so hours are unambiguous.

## Limitations

- **It only contains what we wrote into it.** A model trained here learns the
  generator's rules, not the real world. High accuracy on this data does not
  imply real-world performance.
- **No real prevalence.** Class proportions are configured, so precision, recall
  and score calibration measured here do not transfer to real traffic.
- **Simplified behaviour.** Histories are short (six months by default),
  stationary and generated from a handful of segments; real customers change
  jobs, devices and habits, and have seasonal spending.
- **Templated text.** Request wording comes from a small set of templates, so
  text features are much cleaner than real free text. The NLP stage will need
  more varied data.
- **Hand-chosen overlap.** How far legitimate-unusual, suspicious and fraudulent
  cases overlap was chosen by the authors, not measured.
- **Label certainty.** `isFraud` is known exactly here; real labels arrive late,
  are noisy, and are missing for fraud nobody reported.
- **Features shared with the rules.** Several derived flags mirror the rule
  engine's checks, so comparisons between the model and the rules on this data
  are not fully independent.

## Appropriate use

Suitable for developing and testing the fraud.auth feature pipeline, prototyping
and comparing models, demonstrating the approach, and unit and regression tests.

Not suitable for estimating real fraud rates, making or justifying decisions
about real customers, or claiming real-world detection performance.

## Regenerating the dataset

```sh
npm run data:generate
```

reproduces the default dataset exactly. Options:

```sh
npm run data:generate -- --users 500 --orders 10000 --seed my-seed
npm run data:generate -- --fraud-rate 0.15          # fraudulent share; other classes rescale
npm run data:generate -- --mix legit_normal=0.5,legit_unusual=0.25,suspicious=0.15,fraudulent=0.1
npm run data:generate -- --suspicious-fraud-share 0.5 --history-months 12
npm run data:generate -- --out path/to/dir --with-history
npm run data:generate -- --help
```

The same options and seed always give the same files. The generator can also be
called from code: `generateDataset(config)` in `src/fraud/synthetic/generator.js`.
