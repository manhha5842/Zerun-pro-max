import {
  AppWindow,
  Archive,
  ArrowsCounterClockwise,
  Article,
  Calendar,
  CalendarDots,
  ChatCircle,
  ClockCounterClockwise,
  CloudArrowDown,
  Gear,
  Monitor,
  PencilSimpleLine,
  Pulse,
  Trash,
  UserPlus,
  Wrench,
} from "@phosphor-icons/react";
import { cn } from "../../lib/utils";

export type ZerunIconName =
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

export type PhosphorWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

type PhosphorIconProps = {
  size?: number;
  weight?: PhosphorWeight;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

type ZerunIconProps = PhosphorIconProps & {
  name: ZerunIconName;
  tone?: "default" | "primary" | "muted";
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const iconMap: Record<ZerunIconName, React.ComponentType<any>> = {
  activity: Pulse,
  dashboard: AppWindow,
  compose: PencilSimpleLine,
  content: Article,
  history: ClockCounterClockwise,
  comment: ChatCircle,
  schedule: CalendarDots,
  account: UserPlus,
  archive: Archive,
  trash: Trash,
  calendar: Calendar,
  automation: ArrowsCounterClockwise,
  tool: Wrench,
  session: Monitor,
  crawl: CloudArrowDown,
  settings: Gear,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const toneClassMap = {
  default: "text-current",
  primary: "text-primary",
  muted: "text-muted",
} as const;

export function Icon({ name, size = 20, weight = "regular", tone = "default", className, ...rest }: ZerunIconProps) {
  const PhIcon = iconMap[name];
  return (
    <PhIcon
      size={size}
      weight={weight}
      aria-hidden
      className={cn("shrink-0", toneClassMap[tone], className)}
      {...rest}
    />
  );
}
