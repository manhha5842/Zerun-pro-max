export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "zerun-web-admin-theme";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function getSystemTheme(): ResolvedTheme {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }

  const resolvedTheme = resolveTheme(preference);
  const root = document.documentElement;

  root.dataset.themePreference = preference;
  root.dataset.theme = resolvedTheme;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

export function setThemePreference(preference: ThemePreference) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }

  applyTheme(preference);
}

export function initializeTheme() {
  applyTheme(getStoredThemePreference());
}

export function subscribeToSystemThemeChange(
  onChange: (theme: ResolvedTheme) => void,
) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches ? "dark" : "light");
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }

  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}
