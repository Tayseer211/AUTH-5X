# Model card: fraud.auth standing-order fraud model `fraud-lr-1.1.0`

> **Prototype model trained only on synthetic data.** Every number in this card
> measures how well the model recovers patterns written into the synthetic
> generator. None of them is an estimate of real-world fraud-detection
> performance, and they must not be presented as one. Since Stage 5 the app
> shows the model's output only as a **model estimate** in a LOW / ELEVATED /
> HIGH band ("Synthetic-trained; not calibrated to real-world fraud rates"),
> never as a probability of fraud, and the model cannot raise a request's risk
> on its own (see "Use in the app" below). The rule engine still produces the
> transaction score the app shows.

| | |
|---|---|
| Model | L2-regularised logistic regression (binary) |
| Predicts | `fraudProbability` ∈ [0, 1] — probability that a pending standing-order request is fraud (the synthetic `isFraud` label) |
| Trained on | Synthetic dataset, generator **2.0.0**, default config: 2,000 requests, 200 users, seed `fraud-auth-stage2` |
| Artifact | [`fraud-model.json`](fraud-model.json) — preprocessing, weights, metadata, evaluation, dataset audit; no training records |
| Full results | [`EVALUATION.md`](EVALUATION.md) (regenerated on every training run) |
| Reproduce | `npm run model:train` (byte-identical output) |
| Code | `src/fraud/ml/` · `scripts/train-fraud-model.js` · `scripts/audit-synthetic-dataset.js` |
| Status | Stage 3.1 baseline, for inspection and improvement — not for decisions |

## What changed from Stage 3 (`fraud-lr-1.0.0`)

Stage 3 reached a test ROC-AUC of 0.985, but its own diagnostics showed that much
of that came from how the generator built records rather than from realistic
fraud signals. Stage 3.1 fixed the causes and retrained the same model the same
way. **The metrics fell, and that is the intended outcome**: the task is now
harder and closer to the ambiguity a real fraud model faces.

| Change | Why |
|---|---|
| **Canonical recipient-bank codes** (`src/data/recipientBanks.js`) shared by the demo requests, `extractFeatures`, the generator and the model; the UI still shows "Same bank" etc. | App requests used display labels the model had never seen (every demo request raised an "unseen category" warning), and `overseasRecipient` could never fire for them. |
| **Generator 2.0.0** (details in [DATA_CARD.md](../data/synthetic/DATA_CARD.md#changes-in-generator-200-stage-31)) | Missing categories, security/investment vocabulary, emailed links, threat/"don't call"/credential/impersonation wording and promised returns occurred only in fraud; `riskSignalCount` split the classes (legit_normal ≤ 2, fraud ≥ 3). Now genuine requests use all of these too, fraud has quiet routine-looking variants, and everyday noise is applied to every class alike. |
| `payeeCategory`, `referenceCategory` **restored** as inputs | Excluded in Stage 3 as generator artefacts; the generator was fixed instead, and the audit confirms neither is a shortcut now. |
| `userBaselineTransactionCount`, `userTransactionsPer30Days` **excluded** | Fraud is assigned to users regardless of how much they bank, so these only learnt spurious, mutually cancelling weights (−0.72 / +0.87). They also made the model extrapolate badly: the demo account has 18 settled transactions, synthetic users 66–398, and this one feature added +3.6 to the GREY demo's log-odds. Dropping them did not hurt validation log loss (0.1417 vs 0.1424). |
| **Dataset audit** (`src/fraud/ml/audit.js`, `npm run data:audit`), included in every training report | Makes the shortcut check that found the Stage 3 problems repeatable, and a test (`realism.test.js`) fails if a shortcut returns. |

Unchanged: the logistic regression, Newton/IRLS training, preprocessing, the
user-level stratified 60/20/20 split and its seed, the L2 grid and the
validation-only choice of L2 and threshold, and the fresh-seed hold-out.

| | Stage 3 (`1.0.0`, generator 1.0.0) | Stage 3.1 (`1.1.0`, generator 2.0.0) |
|---|---|---|
| Test ROC-AUC (ML / rules) | 0.985 / 0.917 | **0.964 / 0.872** |
| Test F1 at candidate threshold (ML / tuned rules) | 0.782 / 0.658 | **0.597 / 0.420** |
| Hold-out ROC-AUC (ML / rules) | 0.987 / 0.937 | **0.972 / 0.908** |
| Hold-out F1 (ML / tuned rules) | 0.823 / 0.690 | **0.728 / 0.576** |
| `riskSignalCount` AUC on its own (training) | 0.978 | 0.951 |
| Label shortcuts in the dataset audit | 2 (found by hand) | **0** |
| Demo FRAUD / GREY / LEGITIMATE | 1.000 / **0.994** / 0.008 (all with warnings) | 1.000 / **0.174** / 0.009 (no warnings) |

The two stages were trained and tested on different datasets, so the rows
compare how hard each synthetic world is, not two models on the same data.

## Why logistic regression

Kept from Stage 3; nothing in Stage 3.1 required changing it.

- **An honest baseline**: one weight per feature, no hidden layers; any later
  model has to beat it by a visible margin.
- **Interpretable**: weights and per-feature attributions are how the Stage 3
  artefacts and the GREY over-confidence were diagnosed.
- **Outputs a probability**, not three fixed outcomes.
- **No dependencies**: training and prediction are plain JavaScript; prediction
  is one dot product, so the browser app can run it without a backend.
- **Deterministic**: Newton's method from zero weights.

## What it trains on

The model reads only the `raw` and `derived` feature sections produced by
`extractFeatures` (`src/fraud/features.js`) — the same function that will
compute features for a real pending request. **61 features**, encoded as **126
numeric columns** (`src/fraud/ml/featureSpec.js`):

- **Request**: frequency, recipient bank (canonical code), channel, hour
  (cyclic), minutes since the payee was added.
- **User baseline**, as context for the ratios: average amount, standing-order
  count and amount range, known devices, usual channel.
- **Payee history**: earlier payments, their average and recency, whether this
  account number was used before, any existing standing order to the payee.
- **Amount**: log amount, ratios to the user's average / largest standing
  order / payee average / existing order, z-score, annualised amount.
- **Behaviour flags**: new payee, look-alike name, changed account, new device,
  unusual hour/day/channel/frequency, recent beneficiary, overseas payee, …
- **Wording flags**: urgency, threats, "don't call the bank", links, credential
  requests, bank impersonation, "details have changed", promised returns; plus
  payee and reference **categories**. The free text itself is left for the NLP
  stage.
- `riskSignalCount` — how many departure-from-normal flags are set (computed
  from features, not labels).

### What it never sees

Every schema field is either an input or listed in `EXCLUDED_FIELDS` with a
reason; a test fails if a new field is neither.

| Excluded | Why |
|---|---|
| `isFraud` | The target. |
| `riskClass`, `scenario` | Describe how the record was generated — would leak the answer. Used only to break down the evaluation. |
| `ruleEngineScore`, `ruleEngineRiskLevel` | Rule-engine benchmark; comparison only. |
| `standingOrderId`, `userId`, `deviceId`, `recipient`, `recipientAccount` | Identifiers — would let the model memorise users, payees or devices. |
| `requestText`, `description`, `paymentReference` | Free text, reserved for the NLP stage. |
| `userBaselineTransactionCount`, `userTransactionsPer30Days` | Account activity volume — see above. |
| Absolute timestamps, calendar day numbers, lists, exact duplicates | Calendar artefacts or already covered by a derived flag. |

The three **demo cases** are not in the dataset and are never trained on:
training refuses any record that is not a synthetic `SYN-SO-…` record, and a
test checks the demo requests are rejected.

### Preprocessing

Learnt from the **training split only** and stored in the artifact: `log1p` /
`log` transforms for amounts, counts and ratios; median imputation plus a
"missing" column for nullable numbers; standardisation, clipped at ±5 SD;
one-hot categories over the schema's full vocabulary (null is its own level;
an unknown value encodes as zeros and produces a warning).

## How the data is split

**User-level, stratified** 60 / 20 / 20, seed `fraud-auth-stage3` — every record
of a user in one split; users ordered by their number of fraud records and dealt
out in blocks of ten. A test checks that no user is in two splits.

| Split | Records | Fraud | Users |
|---|---|---|---|
| train | 1,212 | 149 (12.3%) | 120 |
| validation | 384 | 50 (13.0%) | 40 |
| test | 404 | 48 (11.9%) | 40 |

**Validation** chooses exactly two things: the L2 strength (lowest validation
log loss over 0.0001–1 → **0.001**) and the candidate threshold (highest
validation F1 → **0.6**). **The test set is used once**, afterwards.

A **fresh-seed hold-out** (5,000 records, 500 new users, seed
`fraud-auth-stage3-holdout`) is also scored. It comes from the same generator —
not an independent real-world test — but gives enough records per scenario.

**Split comparison.** A record-level split now scores *higher* (test ROC-AUC
0.975, F1 0.724 at its own threshold 0.25) than the user-level split (0.964 /
0.597). This is mostly sample variation between two 404-record test sets with
~48 fraud each: the canonical user-level test set is an unusually hard draw (see
[Why test recall is lower than on the hold-out](#why-test-recall-is-lower-than-on-the-hold-out)).
The user-level split stays the reported one: it is the more conservative
estimate for customers the model has never seen.

## Results (synthetic data)

### Test set — held-out users (404 records: 48 fraud, 356 legitimate)

| Metric | ML at candidate threshold 0.6 | ML at 0.5 |
|---|---|---|
| Accuracy | 92.3% | 92.1% |
| Precision | 79.3% | 73.5% |
| Recall | 47.9% | 52.1% |
| F1 | 0.597 | 0.610 |
| Confusion (TP / FP / FN / TN) | 23 / 6 / 25 / 350 | 25 / 9 / 23 / 347 |

Threshold-free: **ROC-AUC 0.964**, average precision 0.800, log loss 0.155,
Brier 0.051.

### Why test recall is lower than on the hold-out

At the same threshold (0.6), recall is 47.9% on the test set but 62.6% on the
5,000-record fresh-seed hold-out (F1 0.597 against 0.728). The Stage 3.1
verification checked whether this is a bug or evaluation inconsistency. It is
not. Recomputing both confusion matrices with independent code reproduces the
reported numbers exactly, the hold-out uses the same generator version and
configuration apart from seed and size, and ranking quality is consistent
(ROC-AUC 0.964 against 0.972). The canonical test split is an **unusually
difficult sample**:

- **It is small.** 48 fraud cases, so each one is about two points of recall.
- **It is heavy in the hardest cases.** 22 of its 48 frauds (46%) come from the
  ambiguous suspicious class, against 34% in the hold-out; it also contains
  more `mimic_routine` fraud (7 of 48, 15%, against 9.5%), the fraud pattern
  the model catches least.
- **The mix explains most of the gap.** Applying the hold-out's per-scenario
  recall to the test set's scenario mix predicts about **53.4%** recall. The
  remaining ~5 points is about 2–3 records out of 48.
- **It is a low draw.** Across 2,000 random 40-user samples from the hold-out,
  scored by the same model, the canonical test recall sits at about the
  **1.6th percentile**.
- **Other splits look different.** Across 8 alternative split seeds, the same
  pipeline gives test F1 of **0.69–0.80** and recall of **0.57–0.90**. Their
  validation-chosen thresholds range from 0.15 to 0.75, so with ~50 frauds in
  the validation set, the threshold choice itself is noisy.

**The canonical test split is deliberately kept unchanged.** Switching to a more
favourable split seed after seeing its test results would be test-set tuning:
the reported numbers would no longer be an unbiased estimate. Both the test and
hold-out results are therefore reported as measured, and neither was tuned on.

**For future stages**, a single 404-record test split is too small to give a
stable estimate. Results should be averaged across multiple splits (for example
repeated user-level splits or grouped cross-validation), reported with their
spread, alongside the fresh-seed hold-out.

### What the metrics mean

- **Accuracy** — share of all requests classified correctly. Misleading here:
  calling everything legitimate already scores 88%.
- **Precision** — of the requests flagged, how many really are fraud (low →
  genuine payments held).
- **Recall** — of the real frauds, how many are caught (low → fraud gets
  through).
- **F1** — harmonic mean of precision and recall.
- **Confusion matrix** — TP fraud caught, FP genuine payment flagged, FN fraud
  missed, TN genuine payment let through.
- **ROC-AUC** — chance a random fraud scores above a random genuine request
  (0.5 = guessing, 1 = perfect ranking); threshold-free.
- **Average precision** — like ROC-AUC but focused on the fraud class; more
  informative when fraud is rare.
- **Log loss / Brier** — quality of the probabilities themselves (lower is
  better).

### Threshold analysis

| Threshold | Test: precision | Test: recall | Test: F1 | Hold-out: precision | Hold-out: recall | Hold-out: F1 | Hold-out: false-positive rate |
|---|---|---|---|---|---|---|---|
| 0.1 | 55.3% | 87.5% | 0.677 | 53.1% | 93.0% | 0.676 | 11.4% |
| 0.3 | 69.6% | 66.7% | 0.681 | 68.5% | 80.0% | 0.738 | 5.1% |
| 0.5 | 73.5% | 52.1% | 0.610 | 81.7% | 69.5% | 0.751 | 2.2% |
| 0.6 | 79.3% | 47.9% | 0.597 | 87.0% | 62.6% | 0.728 | 1.3% |
| 0.7 | 87.5% | 43.8% | 0.583 | 92.1% | 57.4% | 0.707 | 0.7% |
| 0.9 | 100% | 33.3% | 0.500 | 98.8% | 41.1% | 0.581 | 0.1% |

- **Candidate threshold 0.6** (highest validation F1) is stored in the artifact
  as a candidate for experimentation, **not a production threshold**. On both
  evaluation sets a lower threshold (0.3–0.5) would have given a higher F1; that
  is reported, not tuned away.
- **Cost-sensitive example**: if a missed fraud costs 5× a wrongly held payment,
  the validation optimum is **0.05**.
- The right threshold depends on the real costs of each error and on real fraud
  prevalence — neither is knowable from synthetic data, so none is hard-coded.

### Against the rule engine (same records)

The rule engine's 0–100 safety score is turned into a fraud score as
100 − score; its cutoff is tuned for F1 on the validation set, exactly like the
model's threshold.

| Test set (404) | TP | FP | FN | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| ML, threshold 0.6 | 23 | 6 | 25 | 79.3% | 47.9% | 0.597 |
| Rules, tuned cutoff (score ≤ 63) | 17 | 16 | 31 | 51.5% | 35.4% | 0.420 |
| Rules, HIGH band (score < 40) | 4 | 1 | 44 | 80.0% | 8.3% | 0.151 |
| Rules, MEDIUM or HIGH (score < 85) | 36 | 64 | 12 | 36.0% | 75.0% | 0.486 |

| Fresh-seed hold-out (5,000) | TP | FP | FN | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| ML, threshold 0.6 | 382 | 57 | 228 | 87.0% | 62.6% | 0.728 |
| Rules, tuned cutoff (score ≤ 63) | 317 | 173 | 293 | 64.7% | 52.0% | 0.576 |
| Rules, MEDIUM or HIGH (score < 85) | 517 | 888 | 93 | 36.8% | 84.8% | 0.513 |

ROC-AUC: ML 0.964 vs rules 0.872 (test); 0.972 vs 0.908 (hold-out).

### By scenario (fresh-seed hold-out, 5,000 records)

The test set has 2–7 records per fraud scenario (see `EVALUATION.md`), too few to
judge, so scenarios are compared on the hold-out. ML at 0.6; rules at the tuned
cutoff.

| Fraud scenario | n | ML caught | Rules caught |
|---|---|---|---|
| `bank_impersonation` | 97 | 100% | 100% |
| `account_takeover` | 76 | 100% | 95% |
| `frequency_drain` | 37 | 100% | 54% |
| `investment_scam` | 47 | 89% | **94%** |
| `invoice_redirection` | 54 | **48%** | 6% |
| `weak_signal_stack` | 31 | 45% | 45% |
| `mimic_routine` | 58 | 34% | **53%** |

- **Where ML adds value**: `invoice_redirection` (the rules cannot see the
  changed account number: 48% vs 6%) and `frequency_drain` (100% vs 54%).
- **Where the rules do better**: `mimic_routine` (53% vs 34%) and, slightly,
  `investment_scam` (94% vs 89%). The quiet, routine-looking variants now in the
  data are exactly what a behaviour model trained mostly on anomalies misses;
  the rules' fixed amount checks still catch some of them. This is a concrete
  argument for keeping the rules alongside the model.
- `weak_signal_stack` is a tie at 45%: with three weak signals it overlaps the
  genuine `life_event_multi_signal` requests by design.

**Unusual ≠ fraud.** Of 1,000 genuine-but-unusual hold-out requests the model
flags **24 (2.4%)**; the tuned rules flag 135 and the rules' MEDIUM-or-HIGH band
510. The model's false alarms concentrate where the synthetic world is
deliberately ambiguous: `life_event_multi_signal` 17/81 (21%),
`bank_advised_account_move` 4/40 (10% — the rules flag 38/40), and
`recent_beneficiary_everyday` 3/62. It flags no genuine e-bill-link, investment
plan, large planned payment, branch set-up, late-night or new-device request at
0.6. It flags **0 of 3,000** routine requests.

**Suspicious stays uncertain.** The model catches 33% of suspicious-class fraud
(70/210) and flags 8.5% of suspicious-but-genuine requests (33/390); mean
probabilities are 0.31–0.39. Of the model's hold-out errors, 33 of 57 false
positives and 140 of 228 misses are in this class, whose labels the generator
draws at random.

## Demo requests (information only)

Scored through the prediction interface after retraining; never trained on,
and the 100 / 69 / 8 rule-engine scores are not targets. None raises a warning
now that bank values are canonical.

| Demo case | Rule engine | ML probability (Stage 3 → 3.1) |
|---|---|---|
| LEGITIMATE | 100 | 0.008 → **0.009** |
| GREY | 69 | 0.994 → **0.174** |
| FRAUD | 8 | 1.000 → **1.000** |

**Why GREY was over-confident, and what fixed it.** Measured step by step:

1. **Synthetic-data artefacts.** Retraining on the generator 2.0.0 dataset —
   where genuine requests also combine evening hours, off-cycle days and larger
   amounts — together with the bank fix and the restored category features
   brought GREY from 0.994 to **0.598**. These changes landed together, so their
   shares of that step cannot be
   separated (the 1.0.0 model is not kept). Under the current model, feeding
   GREY an unrecognised bank value instead of the canonical code moves its
   score by less than 0.005, which suggests the bank mismatch itself was a
   minor factor; the data artefacts were the larger one.
2. **An out-of-range input.** A column-by-column attribution of that 0.598 model
   showed its largest single contribution (+3.6 to the log-odds) came from
   `userBaselineTransactionCount`: the demo account's 18 settled transactions
   sat at the −5 SD clip, far below any synthetic user, and the feature's weight
   was spurious. Removing the two activity-volume features took GREY to
   **0.174**.

GREY's score now comes from its real signals — submitted at 23:40, three hours
outside the user's usual window (+2.1), an off-cycle payment day (+0.55), a 67%
increase (+0.46) — offset by the payee and arrangement being long established.
No input is clipped. A probability of 0.17 is below the candidate threshold but
well above routine requests (≈ 0.00–0.01), which is a reasonable reading of an
ambiguous request; it was not engineered to match the rule engine's "review".

## Limitations and warnings

**These results are not real-world performance.** In particular:

1. **The model learns the generator, not fraud.** Scenarios, their mix and
   their overlap were written by hand. Removing the obvious shortcuts made the
   task harder, but the data still contains only the patterns we wrote.
2. **Fraud always involves a new or changed payee.** `beneficiaryAddedMinutesBefore`
   is never null for suspicious or fraudulent requests, but null for 77% of
   routine ones — so "payee long on file, nothing changed" effectively means
   "genuine" here. Broadly true of push-payment fraud, but not always (e.g. fraud
   to a payee groomed over weeks); not modelled.
3. **Signals are strong, not perfect.** The audit finds no value that is fraud
   ≥ 97% of the time, but some remain strongly fraud-associated
   (bank-impersonation wording 79%, daily frequency 68%). Their exact strength
   is an authoring choice. `riskSignalCount` still has AUC 0.95 on its own;
   removing it leaves the model essentially unchanged (test ROC-AUC 0.965).
4. **Prevalence is configured** (12.35% fraud). Real fraud is far rarer:
   precision would be much lower at the same threshold, and probabilities would
   need recalibration.
5. **Features overlap with the rules**, so the ML-vs-rules comparison is not
   independent.
6. **Small evaluation sets**: 48 frauds in the test set; the hold-out comes from
   the same generator.
7. **Short real histories are out of range.** Synthetic users have 66–398
   settled transactions; real new customers (and the demo account) have fewer.
   Activity-volume features were removed for this reason, but amount and hour
   baselines from a short history are also noisier than anything in training.
8. **Individual weights should not be read in isolation**: several features are
   correlated or exact complements, so single weights can have
   counter-intuitive signs.
9. **Labels are exact here**; real fraud labels are late, noisy and incomplete.

## Use in the app (Stage 5)

The verification flow scores each pending standing order through the hybrid
assessment (`src/fraud/assessment.js`, policy `hybrid-1` in
`src/fraud/aggregation.js`). The model's part:

- **Transaction-only input.** The request is scored with its message text
  removed (`src/fraud/ml/explain.js`). The message is judged by the text
  classifier; the model's own text weights are unreliable (see limitation 8)
  and would count the same words twice.
- **Model estimate, not a probability.** The output is shown as a band:
  LOW below 0.05, ELEVATED from 0.05, HIGH from 0.6, the two candidate
  thresholds recorded in `fraud-model.json` (`thresholds.costSensitive` and
  `thresholds.candidate`).
- **Part of the transaction family, never its own vote.** With the rule
  checks at LOW, a higher model estimate is only reported as "Model and
  transaction rules disagree". It never lowers a level, and its one effect is
  to strengthen a transaction the rules already rate MEDIUM.
- **Explainable.** The logistic model's logit is split exactly into
  per-feature contributions; the largest are shown.
- **Snapshot.** The estimate is computed once, from the ledger and profile as
  they stood at the analysis time (`asOf`), and stored with the assessment.
  Reopening a request reads the stored estimate; it is never recomputed.

`fraud-model.json` and `EVALUATION.md` are unchanged by this integration.

## Using the model directly

```js
import artifact from '../../models/fraud-model.json'
import { loadFraudModel, predictFraud, predictFraudForRequest } from './fraud/ml/predict.js'

const model = loadFraudModel(artifact)
predictFraudForRequest(model, request, { history, profile })
// → { fraudProbability: 0.07, modelVersion: 'fraud-lr-1.1.0', warnings: [] }
```

`request.recipientBank` may be a canonical code or a display label; it is
normalised. `warnings` lists anything the model has not seen in training
(unknown categories, missing required values); treat such predictions as
low-confidence.

## Reproducing

```sh
npm run data:generate                                   # dataset files (optional)
npm run data:audit                                      # shortcut audit
npm run model:train                                     # train + evaluate → models/
npm run model:train -- --data data/synthetic/generated  # same model from the files
```

`npm run model:train` writes byte-identical `fraud-model.json` and
`EVALUATION.md` on every run; a test retrains on the default dataset and checks
the committed artifact matches exactly.
