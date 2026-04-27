# Global working rules

## Language rules

- When the task involves Vietnamese UI, content, labels, messages, comments, docs, or test data, always use proper Vietnamese with full diacritics.
- Never remove Vietnamese diacritics unless explicitly asked.
- Preserve natural Vietnamese wording; do not output machine-like or unaccented text.
- Prefer UTF-8 encoding for all files that store Vietnamese text.
- When editing i18n or localization files, keep Vietnamese strings readable and complete.
- If a library, database, API, terminal, or file format may break Vietnamese diacritics, stop and point out the risk before changing data.
- Add or keep at least one test/example containing Vietnamese with diacritics when relevant.

## Output rules

- Explanations to me should be in Vietnamese unless I ask otherwise.
- Code comments may be English unless the codebase already uses Vietnamese comments.

## Figma Design System Rules

These rules apply whenever a Figma design is brought into this repository.

### Project structure

- Admin web UI lives in `apps/web-admin`.
- Shared design tokens are defined in `apps/web-admin/src/design-system.ts`.
- Global UI tokens and layout primitives are exposed in `apps/web-admin/src/styles.css`.
- Base UI components live in `apps/web-admin/src/components/ui`.
- Feature-level composition belongs in `apps/web-admin/src/components/common` or `apps/web-admin/src/pages`.

### Styling and token rules

- IMPORTANT: Reuse existing CSS variables in `apps/web-admin/src/styles.css` before adding new values.
- IMPORTANT: If a Figma value introduces a new foundation token, add it to both `apps/web-admin/src/design-system.ts` and `apps/web-admin/src/styles.css`.
- Prefer semantic tokens like `--color-primary`, `--color-border`, `--space-*`, `--radius-*` instead of raw hex, pixel, or rgba values in components.
- Tailwind utility classes may be used inside TSX, but they must resolve to the same semantic token system already used by the app.
- New page sections should reuse `panel`, `page-head`, `form-grid`, `actions`, and other existing layout primitives before inventing one-off wrappers.

### Component rules

- IMPORTANT: Check `apps/web-admin/src/components/ui` for an existing primitive before creating a new Figma-derived component.
- Prefer extending `Button`, `Input`, `Select`, `Textarea`, `Badge`, `Dialog`, and `Label` rather than duplicating them.
- New reusable Figma-derived primitives should be placed in `apps/web-admin/src/components/ui` and exported with PascalCase names.
- Keep component props typed with TypeScript and favor small composable APIs over page-specific prop shapes.
- Avoid inline styles unless the value is truly dynamic and cannot be expressed through existing tokens or utility classes.

### Icon system rules

- The referenced Figma file currently maps to a Vuesax-style icon system with style families `linear`, `outline`, `bold`, `twotone`, `bulk`, and `broken`.
- IMPORTANT: For admin navigation and shared controls, prefer the local icon wrapper in `apps/web-admin/src/components/ui/Icon.tsx` over direct third-party icon usage.
- Keep icon sizes on the established scale from `apps/web-admin/src/design-system.ts`.
- Default admin usage should prefer the `linear` style unless a screen explicitly needs a different set.

### Figma MCP workflow

1. Parse the Figma URL and identify the exact node being implemented.
2. Run `get_design_context` for the target node. If it fails or the response is too large, run `get_metadata` and narrow implementation to specific child nodes.
3. Run `get_screenshot` for visual validation before coding.
4. Translate the Figma structure into the existing React + Tailwind + CSS-variable conventions of `apps/web-admin`.
5. Validate spacing, typography, icon size, and state colors against the screenshot before finishing.

### Asset and dependency rules

- IMPORTANT: Do not add a new icon package when the design can be represented by the local icon system or assets returned from Figma.
- Store any future Figma-exported assets under the app workspace in a stable location and reference them consistently.
- Avoid large dependency additions for purely visual changes unless the user explicitly asks for them.

### Current integration scope

- The shared Figma node `58:1461` resolves to the `Icons` canvas overview rather than the full 6000-component library.
- Treat this Figma reference as the source of truth for icon style direction, not as proof that button, form, card, table, or layout components should be regenerated wholesale.
- If future work targets a specific button, input, modal, card, or page frame, fetch that exact node before implementing or restyling those components.
