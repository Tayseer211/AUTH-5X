const flows = [
  {
    title: "Standing order requests",
    tag: "Inbound",
    steps: [
      {
        name: "Request submitted",
        text: "A customer sets up a new recurring payment in their banking app.",
      },
      {
        name: "Six-signal audit",
        text: "Amount, frequency, recipient, history, context and message text are scored in real time.",
      },
      {
        name: "Decision with reasons",
        text: "Safe orders go through. Suspicious ones are held for review or blocked, and every flag is explained.",
      },
    ],
  },
  {
    title: "Refund claims",
    tag: "Outbound",
    steps: [
      {
        name: "Receipt uploaded",
        text: "The buyer submits a photo of the purchase receipt.",
      },
      {
        name: "AI and forensic checks",
        text: "AI vision reads the receipt and looks for edits, while math and duplicate checks run alongside.",
      },
      {
        name: "Signed QR issued",
        text: "A verified receipt becomes a tamper-proof, digitally signed refund QR.",
      },
      {
        name: "Merchant verifies",
        text: "The merchant scans it on a public page. Refunds already claimed are flagged instantly.",
      },
    ],
  },
];

const stats = [
  { value: "6", label: "risk signals scored per standing order" },
  { value: "4", label: "forensic checks run on every receipt" },
  { value: "0", label: "logins needed to verify a refund" },
  { value: "100%", label: "of decisions written to the audit log" },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-16 bg-ink py-24 text-white [clip-path:polygon(0_4rem,100%_0,100%_100%,0_100%)] sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-[#b4acff] uppercase">
            How it works
          </p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Stop fraud at both ends of the transaction.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            Every check produces a clear verdict with the reasons behind it, so fraud teams,
            customers and merchants all see why a decision was made.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          {flows.map((flow) => (
            <div
              key={flow.title}
              className="rounded-2xl bg-white/[0.04] p-7 ring-1 ring-white/10 sm:p-8"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">{flow.title}</h3>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
                  {flow.tag}
                </span>
              </div>

              <ol className="mt-8">
                {flow.steps.map((step, i) => (
                  <li key={step.name} className="relative flex gap-4 pb-8 last:pb-0">
                    {i < flow.steps.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute top-9 bottom-1 left-[15px] w-px bg-white/15"
                      />
                    )}
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#5a4ff3] to-[#a960ee] text-sm font-semibold">
                      {i + 1}
                    </span>
                    <div className="pt-1">
                      <p className="font-semibold">{step.name}</p>
                      <p className="mt-1 text-[15px] leading-relaxed text-white/65">
                        {step.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <dl className="mt-16 grid grid-cols-2 gap-y-10 border-t border-white/10 pt-12 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="border-l border-white/15 pr-4 pl-5">
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-4xl font-bold tracking-tight">{s.value}</dd>
              <dd className="mt-2 text-sm leading-snug text-white/65">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
