import type { CSSProperties } from "react";

const paths = {
  search: "m21 21-4.7-4.7 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  compass:
    "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M16.2 7.8l-2.8 5.6-5.6 2.8 2.8-5.6 5.6-2.8Z",
  map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z M9 3v15 M15 6v15",
  brief:
    "M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3 M8 2h8v4H8V2Z M7 12l2 2 4-4 M7 18h10",
  filter: "M4 7h9 M17 7h3 M4 17h3 M11 17h9 M13 4v6 M7 14v6",
  close: "m6 6 12 12 M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  arrow: "M5 12h14 m-6-6 6 6-6 6",
  external:
    "M14 3h7v7 m0-7-11 11 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  home: "m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8",
  land: "m3 8 9-5 9 5-9 5-9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5",
  tree: "M12 22v-5 M12 2l6 7h-3l5 8H4l5-8H6l6-7Z",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5",
  waves:
    "M2 6c3-4 5 4 8 0s5 4 8 0 4 0 4 0 M2 12c3-4 5 4 8 0s5 4 8 0 4 0 4 0 M2 18c3-4 5 4 8 0s5 4 8 0 4 0 4 0",
  check: "m5 12 4 4L19 6",
  info: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 11v6 M12 7h.01",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2l1 4 M4 12l1 4a8 8 0 0 0 13 2",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  target:
    "M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M12 2v4 M12 18v4 M2 12h4 M18 12h4",
  leaf: "M20 3C7 1 1 8 6 15s15 3 14-12Z M4 21l10-11",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
