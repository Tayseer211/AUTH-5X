import { useId } from "react";

export function Logo({ light = false }: { light?: boolean }) {
  const gradientId = useId();

  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5a4ff3" />
            <stop offset="1" stopColor="#a960ee" />
          </linearGradient>
        </defs>
        <path
          d="M16 2.5l11 4.2v8.1c0 7-4.7 12.6-11 14.7C9.7 27.4 5 21.8 5 14.8V6.7z"
          fill={`url(#${gradientId})`}
        />
        <path
          d="M11 16.2l3.4 3.4 7.1-7.1"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`text-lg font-bold tracking-tight ${light ? "text-white" : "text-ink"}`}
      >
        fraud<span className={light ? "text-[#b4acff]" : "text-brand"}>.auth</span>
      </span>
    </span>
  );
}
