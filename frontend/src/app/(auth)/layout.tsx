import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Check } from "@/components/icons";

const benefits = [
  {
    title: "Audit standing orders",
    body: "Score every new standing order on six risk signals before the first payment leaves.",
  },
  {
    title: "Catch forged receipts",
    body: "AI forensics checks the math, fonts, and layers of every refund receipt.",
  },
  {
    title: "Verify refunds in seconds",
    body: "Signed refund QRs any merchant can check, with no login required.",
  },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[440px] sm:h-[520px]">
        <div className="hero-gradient" />
      </div>

      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" aria-label="fraud.auth home">
          <Logo />
        </Link>
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-start gap-12 px-4 pt-8 pb-20 sm:px-6 lg:grid-cols-[1fr_440px] lg:gap-20 lg:pt-20">
        <section className="hidden lg:block">
          <h2 className="max-w-md text-4xl leading-[1.1] font-bold tracking-tight text-balance text-ink">
            Stop payment fraud before the money moves.
          </h2>
          <ul className="mt-10 max-w-md space-y-7">
            {benefits.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/80 text-brand ring-1 ring-ink/10">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <div>
                  <p className="font-semibold text-ink">{b.title}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-body">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="mx-auto w-full max-w-[440px]">{children}</div>
      </main>

      <footer className="relative mx-auto flex w-full max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 pb-8 text-xs text-muted sm:px-6">
        <span>© 2026 fraud.auth</span>
        <Link href="/" className="transition-colors hover:text-ink">
          Back to home
        </Link>
      </footer>
    </div>
  );
}
