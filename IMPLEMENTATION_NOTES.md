# Zerun Web Admin UI Implementation Notes

## Overview
Implemented comprehensive account management UI upgrades in `apps/web-admin` for Zerun-pro-max, centered around a new unified account-creation flow on `/accounts` while preserving existing Sources and Targets entry points.

## What Was Implemented

### 1. Centralized Account Management (`/accounts`)
- Added **"Thêm tài khoản mới"** CTA on the Accounts page.
- Added a new **3-step wizard dialog**:
  1. choose kind: `source` or `target`
  2. choose platform: `facebook`, `telegram`, `x`, `threads`, `instagram`
  3. fill platform-specific fields + JSON overrides
- Added quick metrics for total accounts, source accounts, target accounts, and Facebook target accounts.
- Added inline Facebook session guidance specifically for posting targets.
- Added actions for:
  - account health test
  - delete with confirmation dialog (`window.confirm`)
- Added loading and inline success/error feedback states.

### 2. Platform-Specific Account Forms
Created dedicated components under `apps/web-admin/src/components/accounts/`:
- `AddAccountDialog.tsx`
- `FacebookAccountForm.tsx`
- `TelegramAccountForm.tsx`
- `XAccountForm.tsx`
- `ThreadsAccountForm.tsx`
- `InstagramAccountForm.tsx`

These support the requested fields:
- **Facebook**
  - `name`
  - `handle`
  - `authPath`
  - `sessionDir`
  - `config`
  - `credentials`
- **Telegram**
  - `apiId`
  - `apiHash`
  - `session`
  - optional `phone`
- **X / Twitter**
  - `username`
  - `password`
  - `email`
  - optional `twoFactorSecret`
- **Threads**
  - `sessionDir`
  - or Instagram `username/password`
- **Instagram**
  - `username`
  - `password`

### 3. Shared Form Engine Upgrade
Rebuilt `apps/web-admin/src/pages/accountForms.tsx` into a reusable form engine with:
- strongly typed account draft state
- platform-aware validation
- JSON object validation for `credentials` and `config`
- path validation for `authPath` / `sessionDir`
- reusable `AccountForm` for Sources/Targets pages
- reusable helpers for centralized wizard flow

### 4. Sources / Targets Pages Improved (Option A retained)
Per requested direction, existing inline add forms were **kept** and improved rather than removed.

#### `SourcesPage.tsx`
- improved messaging and UX
- added validation-backed inline form
- added success/error banner feedback
- kept crawl action
- added handle display in the table

#### `TargetsPage.tsx`
- improved messaging for Facebook posting accounts
- added validation-backed inline form
- added success/error banner feedback
- added handle display in the table

### 5. UX / Styling Improvements
Added styling in `styles.css` for:
- wizard stepper
- choice cards
- inline notes
- success/error banners
- helper text and muted metadata
- improved account-form layouts

## Backend API Validation
Checked backend implementation in `apps/api/src/app.ts`.

### Confirmed existing endpoints
- `POST /api/v1/sources`
- `POST /api/v1/targets`
- `POST /api/v1/accounts/:id/test`
- `DELETE /api/v1/sources/:id`
- `DELETE /api/v1/targets/:id`
- `GET /api/v1/accounts`

### Backend behavior found
Current backend handlers are permissive and pass `request.body as any` directly into Prisma create/update calls:
- `sourceAccount.create({ data: request.body as any })`
- `targetAccount.create({ data: request.body as any })`

This means the current frontend payload shape is accepted as long as it matches existing Prisma fields:
- `name`
- `platform`
- `handle`
- `credentials`
- `config`
- `isActive`

### Important backend assumptions / gaps
1. **`authPath` and `sessionDir` are not first-class columns** in Prisma models.
   - They are stored inside `credentials` JSON from the frontend.
   - This is compatible with the current API behavior.
2. **No server-side validation currently exists** for platform-specific credentials.
   - Validation is frontend-only in this implementation.
3. **No dedicated POST `/accounts` endpoint exists.**
   - The unified Accounts page wizard dispatches to `/sources` or `/targets` based on chosen kind.
4. **Delete confirmation is client-side only.**
5. **Toast system not present in app infrastructure.**
   - Implemented inline success/error banners instead.
6. **No dedicated backend help endpoint for session setup.**
   - Guidance is provided entirely in the UI.

## Prisma Model Check
Validated `packages/db/prisma/schema.prisma`:
- `SourceAccount` fields include:
  - `platform`, `name`, `handle`, `isActive`, `health`, `credentials`, `config`
- `TargetAccount` fields include:
  - `platform`, `name`, `handle`, `isActive`, `health`, `credentials`, `config`

So the upgraded UI maps cleanly onto the current schema by storing platform-specific session/login details under `credentials` JSON.

## Validation Added in UI
- required display name
- handle sanity check
- valid JSON object requirement for `credentials` and `config`
- path validation for `authPath`, `sessionDir`, `threadsSessionDir`
- Facebook requires at least one of:
  - `authPath`
  - `sessionDir`
- Telegram requires:
  - `apiId`
  - `apiHash`
  - `session`
- X requires:
  - `username`
  - `password`
  - `email`
- Threads requires either:
  - `sessionDir`
  - or Instagram `username/password`
- Instagram requires:
  - `username`
  - `password`

## Assumptions
1. Facebook posting accounts are represented as **target accounts**.
2. `authPath` and `sessionDir` should be persisted in `credentials` JSON because schema columns do not yet exist.
3. The worker/runtime already knows how to interpret those credential keys, or backend worker support will be added separately if needed.
4. Preserving Sources/Targets inline forms is less disruptive than redirecting users immediately to Accounts.

## Suggested Backend Next Steps
1. Add server-side schema validation for source/target create/update endpoints.
2. Consider a dedicated `POST /api/v1/accounts` endpoint that accepts `kind` to simplify the unified Accounts page.
3. Consider explicit schema fields or normalized session models for:
   - `authPath`
   - `sessionDir`
   - storage-state metadata
4. Add encrypted secret storage if raw credentials are considered too sensitive for plain JSON persistence.
5. Add a real toast/notification system for better feedback consistency.

## Validation
Recommended verification command:
- `npm run build -w @zerun/web-admin`

## Date
2026-04-18
