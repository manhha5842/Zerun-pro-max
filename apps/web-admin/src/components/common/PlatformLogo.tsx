import { Facebook, Send, Twitter, Instagram, MessageCircle } from "lucide-react";

type Platform = "facebook" | "telegram" | "x" | "threads" | "instagram";

export function PlatformLogo({ platform, size = 18 }: { platform: Platform; size?: number }) {
  const iconProps = { size, "aria-hidden": true };

  switch (platform) {
    case "facebook":
      return <Facebook {...iconProps} />;
    case "telegram":
      return <Send {...iconProps} />;
    case "x":
      return <Twitter {...iconProps} />;
    case "threads":
      return <MessageCircle {...iconProps} />;
    case "instagram":
      return <Instagram {...iconProps} />;
    default:
      return <MessageCircle {...iconProps} />;
  }
}
