export const designSystem = {
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sizes: {
      xs: "12px",
      sm: "13px",
      md: "14px",
      lg: "16px",
      xl: "20px",
      "2xl": "28px",
      "3xl": "36px"
    },
    lineHeights: {
      tight: 1.1,
      normal: 1.5,
      relaxed: 1.65
    },
    weights: {
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800
    }
  },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    7: "28px",
    8: "32px",
    10: "40px"
  },
  radius: {
    sm: "8px",
    md: "10px",
    lg: "12px",
    pill: "999px"
  },
  iconography: {
    provider: "vuesax-inspired",
    defaultStyle: "linear",
    styles: ["linear", "outline", "bold", "twotone", "bulk", "broken"],
    sizes: {
      sm: "16px",
      md: "20px",
      lg: "24px"
    },
    strokeWidth: {
      linear: 1.9,
      broken: 1.7
    }
  },
  colors: {
    bg: "var(--color-bg)",
    bgMuted: "var(--color-bg-muted)",
    panel: "var(--color-panel)",
    text: "var(--color-text)",
    textMuted: "var(--color-text-muted)",
    textSoft: "var(--color-text-soft)",
    border: "var(--color-border)",
    primary: "var(--color-primary)",
    onPrimary: "var(--color-on-primary)",
    primaryHover: "var(--color-primary-hover)",
    primarySoft: "var(--color-primary-soft)",
    successBg: "var(--color-success-bg)",
    successBorder: "var(--color-success-border)",
    warningBg: "var(--color-warning-bg)",
    warningBorder: "var(--color-warning-border)",
    danger: "var(--color-danger)",
    onDanger: "var(--color-on-danger)",
    dangerBg: "var(--color-danger-bg)",
    dangerBorder: "var(--color-danger-border)",
    overlay: "var(--color-overlay)",
    focusRing: "var(--color-focus-ring)",
    loginHero: "var(--color-login-hero)"
  },
  shadow: {
    soft: "var(--shadow-soft)",
    card: "var(--shadow-card)",
    panel: "var(--shadow-panel)",
    insetAccent: "var(--shadow-inset-accent)"
  }
} as const;

export type DesignSystem = typeof designSystem;
