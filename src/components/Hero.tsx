import { DecorativeQr } from "./DecorativeQr";
import { ArrowRight, Check, Sparkles } from "./icons";

const signals = [
  { label: "Amount", value: "High", tone: "bad" },
  { label: "Frequency", value: "Monthly", tone: "neutral" },
  { label: "Recipient", value: "New", tone: "bad" },
  { label: "History", value: "None", tone: "warn" },
  { label: "Context", value: "Unsolicited", tone: "bad" },
  { label: "Message", value: "3 flags", tone: "bad" },
] as const;

const toneDot = {
  bad: "bg-red-500",
  warn: "bg-amber-400",
  neutral: "bg-slate-300",
};

function RiskRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#fde2e2" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#e5484d"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-ink">
        {score}
      </span>
    </div>
  );
}

function StandingOrderCard() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_30px_60px_-12px_rgb(50_50_93/0.25),0_18px_36px_-18px_rgb(0_0_0/0.3)] ring-1 ring-ink/5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            Standing order review
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted">SO-4821</p>
        </div>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-100">
          Blocked
        </span>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <RiskRing score={92} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">Apex Trade Capital</p>
          <p className="text-sm text-body">Rs 15,000 / month · new recipient</p>
          <p className="mt-1 text-xs font-semibold text-red-600">High risk</p>
        </div>
      </div>

      <blockquote className="mt-5 rounded-lg bg-surface p-3 text-[13px] leading-relaxed text-body">
        “<mark className="rounded bg-red-100 px-0.5 text-red-700">Urgent</mark>: your
        trading account is pending. A monthly payment is{" "}
        <mark className="rounded bg-red-100 px-0.5 text-red-700">required to activate</mark>{" "}
        it. Please{" "}
        <mark className="rounded bg-red-100 px-0.5 text-red-700">verify your account</mark>{" "}
        today.”
      </blockquote>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
        {signals.map((s) => (
          <div key={s.label}>
            <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">
              {s.label}
            </dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink">
              <span className={`size-1.5 rounded-full ${toneDot[s.tone]}`} />
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RefundQrCard() {
  const checks = ["Receipt math", "Font & layers", "Not a duplicate", "Signature"];
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_30px_60px_-12px_rgb(50_50_93/0.25),0_18px_36px_-18px_rgb(0_0_0/0.3)] ring-1 ring-ink/5">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <p className="text-sm font-semibold text-ink">Refund QR verified</p>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <DecorativeQr className="size-24 shrink-0 rounded-md text-ink ring-1 ring-line" />
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c} className="flex items-center gap-1.5 text-[13px] text-body">
              <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />
              {c}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
        <span className="text-muted">Harbour Pharmacy</span>
        <span className="font-mono font-medium text-ink">Rs 1,240.00</span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="hero-gradient" />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-32 pb-24 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-36 lg:pb-60">
        <div>
          <a
            href="#products"
            className="group inline-flex items-center gap-2 rounded-full bg-white/70 py-1 pr-3 pl-1 text-sm font-medium text-ink ring-1 ring-ink/10 backdrop-blur transition hover:bg-white"
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
              <Sparkles className="size-3" /> New
            </span>
            AI-powered receipt forensics
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>

          <h1 className="mt-6 text-5xl leading-[1.04] font-bold tracking-tight text-balance text-ink sm:text-6xl lg:text-[4.1rem]">
            Stop payment fraud before the money moves.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-body sm:text-xl">
            fraud.auth audits suspicious standing orders, catches forged refund receipts
            with AI forensics, and lets any merchant verify a refund in seconds, with no
            login required.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#products"
              className="group inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-3 text-[15px] font-semibold text-white shadow-lg shadow-brand/25 transition-colors hover:bg-brand-dark"
            >
              Start now
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#audit-log"
              className="group inline-flex items-center gap-1.5 rounded-full px-5 py-3 text-[15px] font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-white/60"
            >
              See live activity
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-body">
            {["6-signal risk engine", "AI tamper detection", "Signed refund QRs"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-brand" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="lg:ml-12">
            <StandingOrderCard />
          </div>
          <div className="mt-5 sm:ml-auto sm:w-80 lg:absolute lg:top-full lg:-left-6 lg:-mt-4 lg:w-72">
            <RefundQrCard />
          </div>
        </div>
      </div>
    </section>
  );
}
