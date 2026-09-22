# fraud.auth — Project Plan

Hackathon project. Enterprise fintech security platform tackling two fraud problems:
fake recurring bank payments (Standing Order fraud) and fake purchase refunds (Receipt fraud).

> Status: homepage built (build step 1). This plan may change.

## Tech stack

- **Next.js** (React) with **TypeScript** and **Tailwind CSS**. One app for both pages and server logic.
- **Claude (Anthropic API)** with vision for reading receipts and detecting tampering.
- No separate database for the demo. The audit log is stored in the browser (localStorage) for now.
- Deploy on **Vercel** (free tier).
- Look: light, professional Stripe-style design: animated gradient hero, navy text, indigo
  accent, and one dark "How it works" section.

## Features

### 1. Standing Order Risk Engine (inbound risk)

Scammers trick victims into setting up recurring payments (e.g. "Pay Rs 15,000/month to activate
your trading account"). Banks miss this because the user authorizes it.

The user fills a form and the engine scores 6 signals, then gives an overall risk score with a
plain-English reason for each flag:

| Signal | What it checks |
|---|---|
| Amount | High vs. normal recurring value |
| Frequency | Weekly / Monthly / Annual |
| Recipient | New vs. recognized vendor |
| Payment history | Prior transfers to this account |
| Context | Expected invoice vs. unsolicited message |
| Message text (NLP) | Coercion phrases: "urgent", "required to activate", "verify account", etc. |

### 2. Receipt Forensics & Smart QR Refunds (outbound risk)

Buyers edit receipts (Photoshop/Canva) or re-use old ones to claim refunds.

User uploads a receipt image. Checks:

- **AI read + tamper check (Claude vision):** one request extracts store, date, items, subtotal,
  tax, total, **and** looks for signs of editing (mismatched fonts, pasted-in numbers, odd spacing,
  smudged areas around prices). Returns verdict (clean / suspicious / likely edited), confidence,
  and reasons.
- **Math check:** subtotal + taxes = total.
- **Edit heatmap (Error Level Analysis):** visual overlay where edited regions glow. Good for demos.
- **Metadata check:** flags files saved by editing software.
- **Duplicate check:** image fingerprint (hash) so a re-submitted receipt is flagged.
- **Cryptographic QR:** receipts that pass get a digitally signed QR code that can't be forged or altered.

Results are combined into one final verdict. Pitch as "AI + forensic checks together", not as
foolproof. AI can miss careful, high-quality edits.

Fallback: if no API key is set, the app still runs with the non-AI checks so the demo never breaks.

### 3. Public Merchant Verifier (no login)

Merchant opens a public page, scans (camera) or pastes the customer's refund QR. The system:

- verifies the digital signature is genuine
- re-checks the original receipt math
- flags if the refund was already claimed

### 4. Live Audit Log

Real-time table on the homepage. A row is added for every standing-order check, receipt scan,
generated QR, and merchant verification.

- Built: `src/lib/audit-log.ts`. Tools call `logEvent(...)` and the homepage table updates
  instantly, even across browser tabs.
- Starts with sample events (clearly labelled) plus a "Run sample check" button for demos.

## Setup notes

- Needs an **Anthropic API key** (console.anthropic.com, pay-per-use, a few dollars for a hackathon).
  Stored server-side in `.env.local`, never exposed in the browser or committed to git.
- Run locally: `npm install` once, then `npm run dev` and open http://localhost:3000.

## Build order

1. ~~Project setup + homepage + live audit log~~ ✅
2. Standing Order checker
3. Receipt upload + AI read/tamper check + math + duplicate check
4. Edit heatmap + metadata check
5. Signed QR generation
6. Merchant verifier page
7. Polish + deploy
