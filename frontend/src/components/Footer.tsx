import { Logo } from "./Logo";
import { ArrowRight } from "./icons";

const productLinks = [
  { href: "#products", label: "Standing Order Protection" },
  { href: "#products", label: "AI Receipt Forensics" },
  { href: "#products", label: "Smart Refund QR" },
  { href: "#products", label: "Merchant Verifier" },
  { href: "#audit-log", label: "Live Audit Log" },
];

export function CallToAction() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#5a4ff3] via-[#7b5cf0] to-[#a960ee] px-6 py-16 text-center sm:px-16">
          <div
            aria-hidden
            className="absolute -top-24 -right-24 size-72 rounded-full bg-[#ff5f6d]/30 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-24 -left-24 size-72 rounded-full bg-[#7fd8ff]/30 blur-3xl"
          />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl">
            Close the door on standing order scams and refund fraud.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/80">
            Check a standing order, scan a receipt, or verify a refund QR. Every result shows
            up in the live audit log.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="#products"
              className="group inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-3 text-[15px] font-semibold text-ink transition hover:bg-white/90"
            >
              Start now
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center rounded-full px-5 py-3 text-[15px] font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/10"
            >
              How it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-body">
            Fraud infrastructure for standing orders and refunds.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Product</p>
          <ul className="mt-4 space-y-2.5">
            {productLinks.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="text-sm text-body transition-colors hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted sm:px-6">
          © 2026 fraud.auth. Built for the AUTH-5X hackathon.
        </p>
      </div>
    </footer>
  );
}
