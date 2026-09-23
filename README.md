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
```

### Structure

```
src/
  auth/           account validation and the browser-only account store
  components/     shared UI (buttons, fields, modal, app shell, ...)
  data/           simulated banks, seed history, demo cases, user profile
  fraud/          six-check rule-based fraud engine (checks.js, engine.js)
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

`frontend/` is a separate Next.js site and is not part of this app.
