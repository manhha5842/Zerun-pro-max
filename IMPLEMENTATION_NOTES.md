# Facebook Adapter Implementation Notes

## Overview
Ported production-grade Facebook automation from reference repo (deepmroot-playwright) to Zerun-pro-max TypeScript/Playwright adapter.

## Key Changes

### 1. Session Management
**Before:** `launchPersistentContext` with profile directory
**After:** Storage state (auth.json) pattern from reference repo

- Uses `browser.newContext({ storageState: authPath })` instead of persistent context
- Auth file path: `storage/sessions/facebook/{accountId}/auth.json`
- Validates session by checking `c_user` and `xs` cookies
- Detects login walls and checkpoint phrases

### 2. Authentication Detection
Ported proven auth validation from `api/login.py`:
- Cookie validation: `c_user`, `xs` must be present
- Login wall detection: checks for credential inputs and auth phrases
- Checkpoint detection: separate error type for account review/2FA/suspension
- Returns structured auth state: `ok`, `auth`, or `checkpoint`

### 3. Selectors
Multi-language fallback selectors from reference repo:
- Composer trigger: `"What's on your mind"` / `"Bạn đang nghĩ gì"`
- Post button: `"Post"` / `"Đăng"` / `"Publish"` / `"Xuất bản"`
- Story: `"Create story"` / `"Tạo tin"` / `"Share to story"` / `"Chia sẻ lên tin"`
- Comment box: aria-label patterns + `[data-lexical-editor]` fallback

### 4. Error Handling
Enhanced error classification:
- **Checkpoint errors** (new): account review, 2FA, suspension → pause account, no retry
- **Auth errors**: login/password/session expired → pause account, no retry
- **Network errors**: timeout/connection → retryable
- Screenshot capture on all errors with configurable name

### 5. Post Types
Implemented all three types with proven flows:
- **Feed**: text + multiple media, uses composer dialog
- **Story**: single image, uses story creation flow
- **Reel**: single video, attempts to switch to Reel tab in composer

### 6. Comment Flow
- Navigates to post URL
- Finds comment box with multiple selector fallbacks
- Fills text and submits with Enter key
- Validates auth before commenting

### 7. Cookie Dialog Dismissal
Added automatic cookie consent handling:
```typescript
await page.getByRole("button", { name: /allow all cookies|accept all/i }).click()
```

## Worker Integration
Updated `fb-post.ts` processor:
- Added `screenshotName` parameter to adapter calls
- Screenshot path now matches actual file created by adapter
- Checkpoint errors pause account immediately (no retry)

## Testing Assumptions
1. **Auth file format**: Playwright storage state JSON (cookies, localStorage, sessionStorage)
2. **Headless mode**: Works in headless Chrome (reference uses headless=True)
3. **Timeouts**: Conservative (20-40s for navigation, 60s for video processing)
4. **Selectors**: Tested against English and Vietnamese Facebook UI
5. **Media upload**: Assumes local file paths are accessible to Playwright

## Known Limitations
1. **No login automation**: Adapter expects pre-authenticated storage state
2. **No session refresh**: If cookies expire, manual re-auth required
3. **Group/Page posting**: Not implemented (only profile feed/story/reel)
4. **Marketplace**: Not implemented
5. **Multi-account concurrency**: Worker uses concurrency=1 for Facebook queue

## Migration Path
To use the new adapter:
1. Generate auth.json using Playwright's `context.storageState()` after manual login
2. Store at `storage/sessions/facebook/{accountId}/auth.json`
3. Set `credentials.authPath` in account config (optional, uses default path)
4. Existing persistent context sessions will not work with new adapter

## Reference Patterns Used
- `api/login.py`: Auth validation, cookie checking, login wall detection
- `api/session_manager.py`: Session lifecycle (not ported, Zerun uses DB)
- Selector patterns: Multi-language, aria-label fallbacks
- Error handling: Checkpoint vs auth vs network classification

## Commit Scope
- `packages/adapters/src/platforms/facebook.ts` (rewritten)
- `packages/worker-core/src/processors/fb-post.ts` (screenshot name fix)
- `packages/worker-core/src/runtime.ts` (add missing `kind` field)
- `IMPLEMENTATION_NOTES.md` (this file)

## Date
2026-04-18
