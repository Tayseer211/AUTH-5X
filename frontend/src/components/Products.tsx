import type { ComponentType, SVGProps } from "react";
import { ArrowRight, Check, QrCode, Receipt, Repeat, Scan } from "./icons";

type Product = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  chip: string;
  points?: string[];
  tags?: string[];
};

const products: Product[] = [
  {
    eyebrow: "Inbound risk",
    title: "Standing Order Protection",
    description:
      "Scammers talk victims into setting up recurring payments themselves, so banks see an authorized transfer. Our risk engine audits every new standing order before the first payment leaves.",
    icon: Repeat,
    chip: "from-[#5a4ff3] to-[#a960ee]",
    tags: ["Amount", "Frequency", "Recipient", "Payment history", "Context", "Message text"],
  },
  {
    eyebrow: "Outbound risk",
    title: "AI Receipt Forensics",
    description:
      "Edited or recycled receipts are the easiest way to steal a refund. Upload a receipt and it goes through forensic checks in seconds.",
    icon: Receipt,
    chip: "from-[#ff5f6d] to-[#ffc857]",
    points: [
      "AI detects edited text, pasted numbers and mismatched fonts",
      "Math check: subtotal + taxes = total",
      "Duplicate fingerprinting blocks re-used receipts",
    ],
  },
  {
    eyebrow: "Cryptographic",
    title: "Smart Refund QR",
    description:
      "Every receipt that passes is turned into a digitally signed QR code. Change a single digit and the signature breaks.",
    icon: QrCode,
    chip: "from-[#0ea5e9] to-[#7fd8ff]",
    points: [
      "Tamper-proof digital signature",
      "Carries the original, verified receipt data",
      "Tracks whether the refund has been claimed",
    ],
  },
  {
    eyebrow: "No login needed",
    title: "Public Merchant Verifier",
    description:
      "Any merchant can open the verifier terminal, scan or paste the customer's refund QR, and get an answer instantly.",
    icon: Scan,
    chip: "from-[#10b981] to-[#6ee7b7]",
    points: [
      "Authenticates the digital signature",
      "Re-checks the original receipt math",
      "Flags refunds that were already claimed",
    ],
  },
];

export function Products() {
  return (
    <section id="products" className="scroll-mt-16 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-brand uppercase">Platform</p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight text-balance text-ink sm:text-5xl">
            One platform for fraud coming in and going out.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-body">
            Scams that trick customers into paying, and forged receipts that trick merchants
            into refunding. fraud.auth covers both with one risk engine and one audit trail.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {products.map((p) => (
            <article
              key={p.title}
              className="group flex flex-col rounded-2xl border border-line bg-white p-7 transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-20px_rgb(50_50_93/0.2)] sm:p-8"
            >
              <div
                className={`flex size-11 items-center justify-center rounded-xl bg-linear-to-br text-white shadow-sm ${p.chip}`}
              >
                <p.icon className="size-5" />
              </div>
              <p className="mt-6 text-xs font-semibold tracking-wide text-muted uppercase">
                {p.eyebrow}
              </p>
              <h3 className="mt-1.5 text-xl font-semibold text-ink">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-body">{p.description}</p>

              {p.tags && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <li
                      key={t}
                      className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink ring-1 ring-line"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}

              {p.points && (
                <ul className="mt-5 space-y-2">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex gap-2 text-[15px] text-body">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2.5} />
                      {pt}
                    </li>
                  ))}
                </ul>
              )}

              <a
                href="#how-it-works"
                className="mt-auto inline-flex items-center gap-1 pt-7 text-[15px] font-semibold text-brand"
              >
                Learn more
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
