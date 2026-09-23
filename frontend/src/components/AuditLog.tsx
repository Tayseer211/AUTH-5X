"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  clearEvents,
  simulateEvent,
  useAuditLog,
  type AuditEventType,
  type AuditStatus,
  type RiskLevel,
} from "@/lib/audit-log";
import { Play, QrCode, Receipt, Repeat, Scan, Trash } from "./icons";

export const TYPE_META: Record<
  AuditEventType,
  { label: string; plural: string; icon: ComponentType<SVGProps<SVGSVGElement>>; chip: string }
> = {
  standing_order: {
    label: "Standing order",
    plural: "Standing orders",
    icon: Repeat,
    chip: "bg-indigo-50 text-indigo-600",
  },
  receipt_scan: {
    label: "Receipt scan",
    plural: "Receipts",
    icon: Receipt,
    chip: "bg-orange-50 text-orange-600",
  },
  qr_issued: {
    label: "QR issued",
    plural: "Refund QRs",
    icon: QrCode,
    chip: "bg-sky-50 text-sky-600",
  },
  merchant_verify: {
    label: "Merchant check",
    plural: "Merchant checks",
    icon: Scan,
    chip: "bg-emerald-50 text-emerald-600",
  },
};

const RISK_STYLE: Record<RiskLevel, { label: string; className: string; dot: string }> = {
  low: { label: "Low", className: "text-emerald-700", dot: "bg-emerald-500" },
  medium: { label: "Medium", className: "text-amber-700", dot: "bg-amber-400" },
  high: { label: "High", className: "text-red-700", dot: "bg-red-500" },
};

export const STATUS_STYLE: Record<AuditStatus, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  verified: { label: "Verified", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  issued: { label: "Issued", className: "bg-sky-50 text-sky-700 ring-sky-600/15" },
  review: { label: "In review", className: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  blocked: { label: "Blocked", className: "bg-red-50 text-red-700 ring-red-600/15" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 ring-red-600/15" },
};

type Filter = "all" | AuditEventType;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  ...(Object.keys(TYPE_META) as AuditEventType[]).map((key) => ({
    key,
    label: TYPE_META[key].plural,
  })),
];

const noopSubscribe = () => () => {};

export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function timeAgo(timestamp: number, now: number) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function AuditLog({ page = false }: { page?: boolean }) {
  const events = useAuditLog();
  const hydrated = useHydrated();
  const now = useNow(15_000);
  const [mountedAt] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("all");

  const visible = filter === "all" ? events : events.filter((e) => e.type === filter);
  const stopped = events.filter((e) => e.status === "blocked" || e.status === "rejected").length;
  const cleared = events.filter((e) =>
    ["approved", "verified", "issued"].includes(e.status),
  ).length;
  const hasSamples = events.some((e) => e.sample);

  const Heading = page ? "h1" : "h2";

  const tiles = [
    { label: "Events logged", value: events.length },
    { label: "Threats stopped", value: stopped },
    { label: "Cleared as safe", value: cleared },
  ];

  return (
    <section
      id="audit-log"
      className={`scroll-mt-16 bg-surface pb-24 sm:pb-32 ${page ? "flex-1 pt-32 sm:pt-36" : "pt-24 sm:pt-32"}`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-brand uppercase">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Live audit log
            </p>
            <Heading className="mt-3 text-4xl font-bold tracking-tight text-balance text-ink sm:text-5xl">
              Every decision, recorded as it happens.
            </Heading>
            <p className="mt-5 text-lg leading-relaxed text-body">
              Each standing order check, receipt scan, refund QR and merchant verification
              is added here the moment it runs.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => simulateEvent()}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/85"
            >
              <Play className="size-3.5" fill="currentColor" />
              Run sample check
            </button>
            <button
              type="button"
              onClick={() => clearEvents()}
              disabled={!hydrated || events.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-line transition hover:bg-white/60 disabled:opacity-50"
            >
              <Trash className="size-4" />
              Clear
            </button>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-3 sm:gap-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-white p-4 ring-1 ring-line sm:p-5">
              <p className="text-xs font-medium text-muted sm:text-sm">{t.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums sm:text-3xl">
                {hydrated ? t.value : "–"}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-[0_15px_35px_-10px_rgb(50_50_93/0.12)] ring-1 ring-line">
          <div
            role="tablist"
            aria-label="Filter events"
            className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2"
          >
            {FILTERS.map((f) => {
              const count =
                f.key === "all" ? events.length : events.filter((e) => e.type === f.key).length;
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.key)}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? "bg-surface text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {f.label}
                  {hydrated && (
                    <span className="ml-1.5 text-xs text-muted tabular-nums">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="text-xs font-semibold tracking-wide text-muted uppercase">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-semibold">Event</th>
                  <th className="px-5 py-3 font-semibold">Subject</th>
                  <th className="px-5 py-3 font-semibold">Risk</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {!hydrated &&
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-5 py-4">
                        <div className="h-8 animate-pulse rounded bg-surface" />
                      </td>
                    </tr>
                  ))}

                {hydrated && visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <p className="font-medium text-ink">No events yet</p>
                      <p className="mt-1 text-body">
                        Run a check or press “Run sample check” to see it appear here.
                      </p>
                    </td>
                  </tr>
                )}

                {hydrated &&
                  visible.map((e) => {
                    const meta = TYPE_META[e.type];
                    const risk = RISK_STYLE[e.risk];
                    const status = STATUS_STYLE[e.status];
                    return (
                      <tr
                        key={e.id}
                        className={`transition-colors hover:bg-surface/60 ${
                          e.timestamp > mountedAt ? "row-in" : ""
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.chip}`}
                            >
                              <meta.icon className="size-4" />
                            </span>
                            <div>
                              <p className="font-medium whitespace-nowrap text-ink">{meta.label}</p>
                              <p className="font-mono text-xs text-muted">{e.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[320px] px-5 py-3.5">
                          <p className="truncate font-medium text-ink">{e.subject}</p>
                          <p className="truncate text-muted">{e.detail}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 font-medium whitespace-nowrap ${risk.className}`}
                          >
                            <span className={`size-1.5 rounded-full ${risk.dot}`} />
                            {risk.label}
                            <span className="text-xs text-muted tabular-nums">{e.score}</span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td
                          className="px-5 py-3.5 text-right whitespace-nowrap text-muted tabular-nums"
                          title={new Date(e.timestamp).toLocaleString()}
                        >
                          {timeAgo(e.timestamp, now)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {hydrated && hasSamples && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              Includes sample events for demonstration. Checks you run on fraud.auth appear
              here instantly.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
