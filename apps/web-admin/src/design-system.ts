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
  colors: {
    bg: "#f6f7f9",
    bgMuted: "#f2f4f3",
    panel: "#ffffff",
    text: "#17201b",
    textMuted: "#68746d",
    textSoft: "#536159",
    border: "#dfe4dd",
    primary: "#0f6f5c",
    primaryHover: "#0b5c4c",
    primarySoft: "#dff3ec",
    successBg: "#edf9f2",
    successBorder: "#b6e3cf",
    warningBg: "#fff7e7",
    warningBorder: "#f2d49b",
    danger: "#b42318",
    dangerBg: "#fff1ef",
    dangerBorder: "#f0c4bf"
  },
  shadow: {
    soft: "0 18px 50px rgba(23, 32, 27, 0.08)",
    card: "0 12px 24px rgba(15, 111, 92, 0.08)"
  }
} as const;

export type DesignSystem = typeof designSystem;
