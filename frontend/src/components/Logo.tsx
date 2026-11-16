import { useId } from "react";

import { cn } from "@/lib/utils";

// The InsightPilot mark: a B-2 pilot's helmet with a neon visor.
// Same drawing as public/favicon.svg. Gradient ids are made unique so several
// logos can sit on one page.
export function Logo({ className, title = "InsightPilot" }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const bg = `${id}-bg`;
  const shell = `${id}-shell`;
  const visor = `${id}-visor`;
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={title} className={cn("h-8 w-8 shrink-0", className)}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b1424" />
          <stop offset="1" stopColor="#140c2a" />
        </linearGradient>
        <linearGradient id={shell} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b4a63" />
          <stop offset="1" stopColor="#111827" />
        </linearGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${bg})`} />
      <rect x="7" y="26" width="6" height="14" rx="3" fill="#1e293b" stroke="#22d3ee" strokeWidth="1.5" />
      <rect x="51" y="26" width="6" height="14" rx="3" fill="#1e293b" stroke="#22d3ee" strokeWidth="1.5" />
      <path
        d="M32 5.5c13.6 0 22 9.2 22 22.4v9.4c0 6-3.8 9.8-9.4 11.1L32 51l-12.6-2.6C13.8 47.1 10 43.3 10 37.3v-9.4C10 14.7 18.4 5.5 32 5.5Z"
        fill={`url(#${shell})`}
        stroke="#22d3ee"
        strokeWidth="1.7"
      />
      <path
        d="M13.8 25.2C18 19.8 24.6 17.6 32 17.6s14 2.2 18.2 7.6"
        stroke="#22d3ee"
        strokeOpacity=".55"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M32 9.6l9.2 4.5-2.9.1-2.1 1.5L32 13.9l-4.2 1.8-2.1-1.5-2.9-.1Z" fill="#22d3ee" />
      <path
        d="M15 28.6c0-4.2 3-6.8 7.2-6.8h19.6c4.2 0 7.2 2.6 7.2 6.8v4.4c0 4.2-3.1 7-7.3 7H22.3c-4.2 0-7.3-2.8-7.3-7Z"
        fill={`url(#${visor})`}
      />
      <path
        className="ip-logo-glint"
        d="M20.4 25.6c3.8-1 7.7-1.3 11.4-1.1"
        stroke="#fff"
        strokeOpacity=".8"
        strokeWidth="2.1"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M25.2 41.8h13.6c-.4 5.6-2.8 9.8-6.8 11.6-4-1.8-6.4-6-6.8-11.6Z"
        fill="#1e293b"
        stroke="#22d3ee"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M28.8 47.2h6.4" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M36.2 50.6c3.4 1.4 6.6 3.8 8.6 7.6" stroke="#a855f7" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
