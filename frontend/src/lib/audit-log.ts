import { useSyncExternalStore } from "react";

// Shared audit log. Every tool on the site calls `logEvent` and the homepage table
// updates live. Stored in localStorage so it survives reloads and syncs across tabs.

export type AuditEventType =
  | "standing_order"
  | "receipt_scan"
  | "qr_issued"
  | "merchant_verify";

export type RiskLevel = "low" | "medium" | "high";

export type AuditStatus =
  | "approved"
  | "review"
  | "blocked"
  | "verified"
  | "rejected"
  | "issued";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  subject: string;
  detail: string;
  risk: RiskLevel;
  score: number;
  status: AuditStatus;
  timestamp: number;
  sample?: boolean;
}

export type NewAuditEvent = Omit<AuditEvent, "id" | "timestamp">;

const STORAGE_KEY = "fraudauth.audit-log.v1";
const MAX_EVENTS = 200;
const EMPTY: AuditEvent[] = [];

const ID_PREFIX: Record<AuditEventType, string> = {
  standing_order: "SO",
  receipt_scan: "RC",
  qr_issued: "QR",
  merchant_verify: "MV",
};

const SAMPLES: NewAuditEvent[] = [
  {
    type: "standing_order",
    subject: "Apex Trade Capital",
    detail: "Rs 15,000 / month · “required to activate” detected",
    risk: "high",
    score: 92,
    status: "blocked",
  },
  {
    type: "receipt_scan",
    subject: "Receipt #48213 · Northwind Electronics",
    detail: "Total mismatch: Rs 12,450 shown, Rs 11,450 computed",
    risk: "high",
    score: 88,
    status: "rejected",
  },
  {
    type: "qr_issued",
    subject: "Receipt #48190 · Harbour Pharmacy",
    detail: "All checks passed · signed refund QR issued",
    risk: "low",
    score: 4,
    status: "issued",
  },
  {
    type: "merchant_verify",
    subject: "QR-7F3K2 · Harbour Pharmacy",
    detail: "Signature valid · first claim on this refund",
    risk: "low",
    score: 2,
    status: "verified",
  },
  {
    type: "standing_order",
    subject: "Lagoon Power Co.",
    detail: "Rs 2,300 / month · recognized biller, 14 prior payments",
    risk: "low",
    score: 8,
    status: "approved",
  },
  {
    type: "receipt_scan",
    subject: "Receipt #47702 · Urban Threads",
    detail: "Duplicate fingerprint · first submitted 3 days ago",
    risk: "high",
    score: 95,
    status: "rejected",
  },
  {
    type: "standing_order",
    subject: "Account ••4471",
    detail: "Rs 6,000 / week · new recipient, no payment history",
    risk: "medium",
    score: 54,
    status: "review",
  },
  {
    type: "merchant_verify",
    subject: "QR-2LQ9X · Northwind Electronics",
    detail: "Refund already claimed on 19 Sep",
    risk: "high",
    score: 90,
    status: "rejected",
  },
];

let events: AuditEvent[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function newId(type: AuditEventType) {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, "0");
  return `${ID_PREFIX[type]}-${suffix}`;
}

// How long ago each sample happened, in minutes, matching SAMPLES by index.
const SAMPLE_MINUTES_AGO = [2, 6, 11, 12, 19, 27, 34, 41];

function createSamples(): AuditEvent[] {
  const now = Date.now();
  return SAMPLES.map((sample, i) => ({
    ...sample,
    id: newId(sample.type),
    timestamp: now - SAMPLE_MINUTES_AGO[i] * 60_000,
    sample: true,
  }));
}

function load() {
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        events = parsed as AuditEvent[];
        return;
      }
    }
  } catch {
    // Storage blocked or corrupt: fall through to samples.
  }
  events = createSamples();
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Storage unavailable: the log still works for this page view.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function onStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  load();
  emit();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  if (!loaded) load();
  return events;
}

function getServerSnapshot() {
  return EMPTY;
}

export function useAuditLog() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function logEvent(input: NewAuditEvent): AuditEvent {
  if (!loaded) load();
  const event: AuditEvent = { ...input, id: newId(input.type), timestamp: Date.now() };
  events = [event, ...events].slice(0, MAX_EVENTS);
  persist();
  emit();
  return event;
}

export function clearEvents() {
  loaded = true;
  events = [];
  persist();
  emit();
}

/** Adds a random sample event, for demoing the live table before the tools exist. */
export function simulateEvent() {
  const template = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
  return logEvent({ ...template, sample: true });
}
