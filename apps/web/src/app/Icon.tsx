import type { ReactNode } from "react";

export type IconName =
  | "search"
  | "download"
  | "stack"
  | "book-open"
  | "library"
  | "settings"
  | "sparkles"
  | "chevron"
  | "grid"
  | "list"
  | "clock"
  | "pause"
  | "play"
  | "more"
  | "plus"
  | "close"
  | "check"
  | "server"
  | "folder"
  | "moon"
  | "sun";

const iconPaths: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.4-3.4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M5 20h14" />
    </>
  ),
  stack: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  "book-open": (
    <>
      <path d="M12 6v15" />
      <path d="M3 18a1 1 0 0 0 1 1h3a5 5 0 0 1 5 2 5 5 0 0 1 5-2h3a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3a5 5 0 0 0-5 2 5 5 0 0 0-5-2H4a1 1 0 0 0-1 1v13Z" />
    </>
  ),
  library: (
    <>
      <rect x="3" y="4" width="4" height="16" rx="1" />
      <rect x="10" y="4" width="4" height="16" rx="1" />
      <path d="M3 8h4M10 8h4m3-3 4 14" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.37.28.6.64.6 1.1v3.8c0 .46-.23.82-.6 1.1Z" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 .8 2.2A6.4 6.4 0 0 0 16.8 9l2.2.8-2.2.8a6.4 6.4 0 0 0-4 3.8L12 17l-.8-2.6a6.4 6.4 0 0 0-4-3.8L5 9.8 7.2 9a6.4 6.4 0 0 0 4-3.8L12 3Z" />
      <path d="m19 15 .35 1.1a3.4 3.4 0 0 0 1.55 1.55L22 18l-1.1.35a3.4 3.4 0 0 0-1.55 1.55L19 21l-.35-1.1a3.4 3.4 0 0 0-1.55-1.55L16 18l1.1-.35a3.4 3.4 0 0 0 1.55-1.55L19 15Z" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4" cy="6" r=".7" fill="currentColor" />
      <circle cx="4" cy="12" r=".7" fill="currentColor" />
      <circle cx="4" cy="18" r=".7" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pause: (
    <>
      <path d="M9 8v8M15 8v8" />
    </>
  ),
  play: <path d="m9 7 8 5-8 5V7Z" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  server: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  folder: (
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />
  ),
  moon: <path d="M20.5 14.1A8.2 8.2 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}
