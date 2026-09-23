"use client";

import { useAuditLog } from "@/lib/audit-log";
import { STATUS_STYLE, TYPE_META, useHydrated } from "./AuditLog";

/** The three newest audit events, shown on the Live Audit Log product card. */
export function AuditLogPreview() {
  const events = useAuditLog();
  const hydrated = useHydrated();
  const latest = events.slice(0, 3);

  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Latest events
        </p>
        <p className="text-xs text-muted tabular-nums">
          {hydrated ? `${events.length} logged` : "–"}
        </p>
      </div>

      <ul className="divide-y divide-line">
        {!hydrated &&
          Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="px-4 py-3">
              <div className="h-8 animate-pulse rounded bg-surface" />
            </li>
          ))}

        {hydrated && latest.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">No events yet</li>
        )}

        {hydrated &&
          latest.map((e) => {
            const meta = TYPE_META[e.type];
            const status = STATUS_STYLE[e.status];
            return (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.chip}`}
                >
                  <meta.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{e.subject}</p>
                  <p className="text-xs text-muted">{meta.label}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${status.className}`}
                >
                  {status.label}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
