# AUTH-5X
Hackathon competition

## fraud.auth

Standing-order fraud checks for a simulated Mauritian bank account (MCB, SBM,
MauBank; amounts in MUR). All banks, accounts and payments are simulated, and
data is stored only in the browser's localStorage.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm test         # unit tests (node --test)
npm run data:generate   # regenerate the synthetic dataset
npm run data:audit      # check the dataset for label shortcuts
npm run model:train     # train + evaluate the prototype fraud model (models/)
```

### Structure

```
src/
  auth/           account validation and the browser-only account store
  components/     shared UI (buttons, fields, modal, app shell, ...)
  data/           simulated banks, seed history, demo cases
  fraud/          six-check rule-based fraud engine (checks.js, engine.js),
                  profile derived from history (profile.js), ML feature
                  extraction (features.js), the synthetic dataset
                  generator (synthetic/) and the prototype ML model (ml/)
  pages/          one component per route
  router/         hash router (#/dashboard, #/verify/:id, ...)
  state/          AppProvider: session, ledger and actions
  storage/        namespaced localStorage (fraudauth:v1:*)
  styles/         stylesheet, split from the original prototype
  transactions/   ledger, approval queue, statuses and demo replay
  utils/          formatting and ID/password helpers
  verification/   standing-order verification screen pieces
```

`public/prototype/fraud-auth-prototype.html` is the original compiled
prototype this app was rebuilt from, kept as a reference. It is served at
`/prototype/fraud-auth-prototype.html`.

`data/synthetic/` holds the synthetic standing-order dataset for the future ML
model: generated files in `generated/` and a data card (`DATA_CARD.md`)
explaining how it is made and its limits. It is entirely synthetic, not real
banking data. The generated files are not committed; run `npm run data:generate`
(`scripts/generate-synthetic-dataset.js`) to recreate them.

`models/` holds the machine-learning fraud model (Stage 3, revised in 3.1): a logistic
regression trained on the synthetic dataset (`fraud-model.json`), its generated
evaluation (`EVALUATION.md`) and a model card (`MODEL_CARD.md`). It is a
prototype trained only on synthetic data; its metrics are not real-world
performance, and it is not connected to the UI — the rule engine still scores
every request. `npm run model:train` reproduces it exactly.

`frontend/` is a separate Next.js site and is not part of this app.
