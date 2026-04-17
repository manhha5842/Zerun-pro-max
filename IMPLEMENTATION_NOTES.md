# Zerun Web Admin UI Implementation Notes

## Overview
Implemented and upgraded the React/Vite admin UI in `apps/web-admin` for Zerun-pro-max with a cleaner management console structure, improved Facebook campaign management, and shared status/dashboard components.

## What Was Implemented

### 1. Facebook Campaigns
- Upgraded campaign list page with:
  - empty state
  - create campaign dialog
  - schedule campaign action
  - delete campaign action
  - status badges
- Added campaign detail page:
  - route: `/facebook/campaigns/:id`
  - displays campaign metadata
  - lists imported/manual posts
  - shows post status, media count, target count, and scheduled time
  - supports per-post delete action
  - includes placeholder dialogs for manual add/import flows

### 2. Dashboard Improvements
- Added reusable stats card component
- Added platform-aware health section
- Replaced raw badge usage with reusable status badge component
- Added platform icon support through `PlatformLogo`

### 3. Shared Components Added
Created these reusable components:
- `components/common/PlatformLogo.tsx`
- `components/common/StatusBadge.tsx`
- `components/common/StatsCard.tsx`
- `components/ui/Dialog.tsx`
- `components/ui/Input.tsx`
- `components/ui/Label.tsx`
- `components/ui/Select.tsx`
- `components/ui/Textarea.tsx`

### 4. Routing
Updated `src/App.tsx` to include:
- `/facebook/campaigns/:id`

### 5. Layout Refresh
Updated navigation ordering and improved the shell layout branding for the admin console.

### 6. Existing Pages Normalized
Updated pages to use the new `StatusBadge` where applicable:
- Dashboard
- Contents
- Sources
- Targets
- Routing
- Schedules
- Accounts

## API Endpoints Used
Frontend pages are integrated against existing API endpoints in `apps/api/src/app.ts`.

### Dashboard
- `GET /api/v1/dashboard/stats`
- `GET /api/v1/dashboard/activity`

### Facebook Campaigns
- `GET /api/v1/facebook/campaigns`
- `POST /api/v1/facebook/campaigns`
- `GET /api/v1/facebook/campaigns/:id`
- `DELETE /api/v1/facebook/campaigns/:id`
- `POST /api/v1/facebook/campaigns/:id/schedule`
- `DELETE /api/v1/facebook/posts/:id`

### Other Existing Pages
- contents, sources, targets, routing rules, schedules, accounts, AI configs

## Dependencies Added
Installed in `apps/web-admin`:
- `react-hook-form`
- `zod`
- `@hookform/resolvers`
- `date-fns`

## shadcn/ui Calendar
Executed:
- `npx shadcn@latest add calendar`

Note: in this environment, shadcn generated files into an unexpected alias-based folder outside `apps/web-admin/src`. The app build still succeeds, but the generated calendar component was not wired into active pages in this pass.

## Assumptions / Limitations
1. The backend Facebook campaign API is more limited than the requested final UX.
   - Supported directly today: campaign create/list/detail/delete/schedule
   - Not exposed today as dedicated endpoints: pause/resume campaign, full wizard persistence, rich Excel parsing workflow in UI, target multi-select persistence at campaign level
2. Because of those backend limits, some requested UI flows are implemented as placeholders or partial flows on the detail page.
3. Platform logos were requested as downloaded image assets, but external image downloads were rate-limited during execution. The implementation falls back to Lucide-based platform icons via `PlatformLogo`.
4. Several non-Facebook pages were improved and normalized, but not fully rebuilt into a complete shadcn-heavy design system.

## Validation
Build completed successfully:
- `npm run build` in `apps/web-admin`

## Suggested Next Steps
1. Add backend endpoints for:
   - pause/resume Facebook campaigns
   - campaign-level schedule window/time mode persistence
   - richer import validation and preview
2. Add real toast system and mutation success/error notifications
3. Replace placeholder import/manual post dialogs with functional forms
4. Add logo image assets once stable download sources are available
5. Add calendar-based schedule visualization using a normalized in-app calendar component

## Date
2026-04-18
