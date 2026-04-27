import type { JSX, SVGProps } from "react";
import { cn } from "../../lib/utils";

type ZerunIconName =
  | "activity"
  | "dashboard"
  | "compose"
  | "content"
  | "history"
  | "comment"
  | "schedule"
  | "account"
  | "archive"
  | "trash"
  | "calendar"
  | "automation"
  | "tool"
  | "session"
  | "crawl"
  | "settings";

type IconStyle = "linear" | "outline" | "bold" | "twotone" | "bulk" | "broken";

type ZerunIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: ZerunIconName;
  size?: 16 | 18 | 20 | 24;
  decorative?: boolean;
  tone?: "default" | "primary" | "muted";
  styleSet?: IconStyle;
};

const iconPaths: Record<ZerunIconName, JSX.Element> = {
  activity: (
    <>
      <path d="M4 12h3l2-5 4 10 2-5h5" />
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </>
  ),
  compose: (
    <>
      <path d="M4 20.5 8.5 19 19 8.5 15.5 5 5 15.5 4 20.5Z" />
      <path d="m13.5 7 3.5 3.5" />
      <path d="M20 14.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.5" />
    </>
  ),
  content: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.708" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  comment: (
    <>
      <path d="M7 18.5 3 21v-5.5A7.5 7.5 0 0 1 10.5 8h3A7.5 7.5 0 0 1 21 15.5 5.5 5.5 0 0 1 15.5 21H9" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15h4" />
    </>
  ),
  schedule: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 9h18" />
      <path d="M12 12v4l2 1" />
    </>
  ),
  account: (
    <>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
      <path d="M19.5 8.5h3" />
      <path d="M21 7v3" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7v13h12V7" />
      <path d="M9 11h6" />
      <path d="M8 3h8l2 4H6l2-4Z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 9h18" />
      <path d="M8 13h3" />
      <path d="M13 13h3" />
      <path d="M8 17h3" />
    </>
  ),
  automation: (
    <>
      <path d="M5 12a7 7 0 0 1 12.2-4.7" />
      <path d="M17 4v4h-4" />
      <path d="M19 12a7 7 0 0 1-12.2 4.7" />
      <path d="M7 20v-4h4" />
      <path d="M12 9v3l2 1" />
    </>
  ),
  tool: (
    <>
      <path d="M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.8 2.8-2-2 2.8-2.8Z" />
    </>
  ),
  session: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 18v3" />
      <path d="M9 10l2 2 4-4" />
    </>
  ),
  crawl: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <rect x="4" y="17" width="16" height="4" rx="2" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8.75A3.25 3.25 0 1 0 12 15.25 3.25 3.25 0 1 0 12 8.75Z" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.4 1Z" />
    </>
  )
};

const toneClassMap = {
  default: "text-current",
  primary: "text-primary",
  muted: "text-muted"
} as const;

export function Icon({
  name,
  size = 20,
  decorative = true,
  tone = "default",
  styleSet = "linear",
  className,
  ...props
}: ZerunIconProps) {
  const svgProps =
    styleSet === "bold" || styleSet === "bulk"
      ? { fill: "currentColor", stroke: "none" as const }
      : { fill: "none", stroke: "currentColor" };

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      strokeWidth={styleSet === "broken" ? 1.7 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative}
      role={decorative ? "presentation" : "img"}
      className={cn("shrink-0", toneClassMap[tone], className)}
      {...svgProps}
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}

export type { IconStyle, ZerunIconName };
