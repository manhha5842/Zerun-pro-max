export type SupportedTargetPlatform = "facebook" | "instagram" | "threads";

export const SUPPORTED_TARGET_PLATFORMS: SupportedTargetPlatform[] = ["facebook", "instagram", "threads"];

export function isSupportedTargetPlatform(platform: string): platform is SupportedTargetPlatform {
  return SUPPORTED_TARGET_PLATFORMS.includes(platform as SupportedTargetPlatform);
}

export function getPlatformLabel(platform: string) {
  switch (platform) {
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "threads":
      return "Threads";
    default:
      return platform;
  }
}

export function getAllowedPostTypes(platform: SupportedTargetPlatform) {
  switch (platform) {
    case "threads":
      return ["feed"] as const;
    default:
      return ["feed", "story", "reel"] as const;
  }
}
