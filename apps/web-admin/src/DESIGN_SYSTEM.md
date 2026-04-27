# Web Admin Design System

## Foundations

### Typography
- Font family: Inter + system fallback
- Sizes:
  - xs: 12
  - sm: 13
  - md: 14
  - lg: 16
  - xl: 20
  - 2xl: 28
  - 3xl: 36
- Weights:
  - medium: 500
  - semibold: 600
  - bold: 700
  - extrabold: 800

### Spacing scale
- 4, 8, 12, 16, 20, 24, 28, 32, 40

### Radius
- sm: 8
- md: 10
- lg: 12
- pill: 999

### Iconography
- Direction: Vuesax-inspired icon language from the referenced Figma UI kit
- Default set: linear
- Supported styles for future rollout:
  - linear
  - outline
  - bold
  - twotone
  - bulk
  - broken
- Shared sizes:
  - sm: 16
  - md: 20
  - lg: 24

### Color tokens
- bg: #f6f7f9
- bgMuted: #f2f4f3
- panel: #ffffff
- text: #17201b
- textMuted: #68746d
- textSoft: #536159
- border: #dfe4dd
- primary: #0f6f5c
- primarySoft: #dff3ec
- success/danger/warning surfaces as semantic states

## Component rules
- Buttons, inputs, select, textarea, dialog, badges must consume shared tokens.
- Shared icons should go through `src/components/ui/Icon.tsx` instead of importing mixed icon sets directly into app navigation.
- Page-level CSS should prefer semantic utility classes/tokens over raw hex duplication.
- New pages should start from page-head/panel/form-grid/layout primitives, not one-off spacing rules.

## Rollout order
1. Foundation tokens
2. Base components
3. Layout primitives
4. Feature pages
