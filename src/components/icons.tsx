import type { SVGProps } from "react";

/* אייקונים בקו דק (בסגנון Lucide), בגודל 20 כברירת מחדל. צבע: currentColor. */

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  home: (p: Props) => (
    <Svg {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </Svg>
  ),
  fileText: (p: Props) => (
    <Svg {...p}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8M8 17h5" />
    </Svg>
  ),
  users: (p: Props) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </Svg>
  ),
  receipt: (p: Props) => (
    <Svg {...p}>
      <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Svg>
  ),
  bank: (p: Props) => (
    <Svg {...p}>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M4 10h16M6 10v7M10 10v7M14 10v7M18 10v7" />
      <path d="M3 20h18" />
    </Svg>
  ),
  percent: (p: Props) => (
    <Svg {...p}>
      <path d="M19 5 5 19" />
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
    </Svg>
  ),
  chart: (p: Props) => (
    <Svg {...p}>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </Svg>
  ),
  calendar: (p: Props) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  ),
  audit: (p: Props) => (
    <Svg {...p}>
      <path d="M12 3 4 6v6c0 4.5 3.3 8 8 9 4.7-1 8-4.5 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  settings: (p: Props) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  plus: (p: Props) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  logout: (p: Props) => (
    <Svg {...p}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5M5 12h10" />
    </Svg>
  ),
  chevronDown: (p: Props) => (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  ),
  arrowBack: (p: Props) => (
    // חץ "חזרה" בממשק RTL מצביע ימינה
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  arrowForward: (p: Props) => (
    <Svg {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  ),
  check: (p: Props) => (
    <Svg {...p}>
      <path d="m5 12 5 5L20 7" />
    </Svg>
  ),
  alert: (p: Props) => (
    <Svg {...p}>
      <path d="M12 3 2 21h20z" />
      <path d="M12 10v5M12 18h.01" />
    </Svg>
  ),
  upload: (p: Props) => (
    <Svg {...p}>
      <path d="M12 16V4M6 10l6-6 6 6" />
      <path d="M4 20h16" />
    </Svg>
  ),
  sparkles: (p: Props) => (
    <Svg {...p}>
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 17v4M17 19h4M5 3v3M3.5 4.5h3" />
    </Svg>
  ),
  building: (p: Props) => (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
    </Svg>
  ),
  clock: (p: Props) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  inbox: (p: Props) => (
    <Svg {...p}>
      <path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
      <path d="M4 13h4l2 3h4l2-3h4v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icons;
