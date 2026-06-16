# Platform Automation Roadmap

## Goal
Build a stable multi-platform automation layer for Zerun-pro-max that matches the current Facebook direction:
- one account = one persistent browser profile/session when browser automation is used
- headful by default for debugging and manual intervention
- per-account health check and pause behavior
- sequential execution and clear error classification

## Design principles

### 1. Browser-first for unstable consumer UIs
Use Playwright persistent-session automation for:
- facebook
- instagram
- threads
- optional x browser mode

This is the best fit when:
- OAuth is unavailable or not wanted
- the product must behave like a real logged-in user
- the account may switch page/profile context manually
- session health needs to reflect the actual web UI

### 2. API/client mode when it is simpler and stable enough
Use API or unofficial/private clients for:
- telegram (MTProto session)
- x default mode (agent-twitter-client)
- instagram crawl only (instagram-private-api)
- Zalo personal (`zca-js`)

### 3. Keep the supported Zalo scope explicit
The project supports one Zalo integration:
- `zalo-personal`: QR session, realtime group listening, and group publishing through `zca-js`

## Platform decisions

### Facebook
Status:
- browser automation already exists and should remain the model reference

Direction:
- keep browser automation as the primary publish path
- continue improving feed, story, reel, comment, and session health

### Instagram
Current repo state:
- crawl + publish rely on instagram-private-api
- publish currently only supports simple photo posting

Decision:
- keep private API for crawl only
- move publish and connection health to Playwright persistent-session browser automation

Why:
- reel and story flows are UI-driven and change often
- browser automation matches the Facebook account/session model
- debugging is easier in headful mode

Target capabilities:
- publish feed
- publish story
- publish reel
- browser session health
- screenshot on error

### Threads
Current repo state:
- already uses Playwright persistent context
- publish flow is too thin and needs more robust selectors and media support

Decision:
- keep browser automation
- improve compose, media upload, reply flow, error handling, and auth detection

Target capabilities:
- publish thread text
- publish thread with media
- reply/comment to a thread
- session health

### X
Current repo state:
- uses agent-twitter-client

Decision:
- keep agent-twitter-client as default mode for text posting and crawl
- add optional Playwright mode for accounts that need UI-level reliability or media posting

Routing:
- if `account.config.usePlaywright === true` => browser mode
- otherwise => existing scraper/client mode

### Zalo
Decision:
- use only `zalo-personal`
- authenticate by QR and persist the client session
- listen to configured groups in realtime
- publish only to configured group `threadId` values
- use a secondary account because the client library is unofficial

## Recommended adapter capability matrix

| Platform   | Crawl | Publish text | Publish media | Story | Reel | Comment/Reply | Session model |
|-----------|-------|--------------|---------------|-------|------|---------------|---------------|
| facebook  | yes   | yes          | yes           | yes   | yes  | yes           | browser       |
| instagram | yes   | yes          | yes           | yes   | yes  | later         | browser       |
| threads   | yes   | yes          | yes           | no    | no   | yes           | browser       |
| x         | yes   | yes          | browser mode  | no    | no   | later         | api/browser   |
| telegram  | yes   | yes          | yes           | no    | no   | yes           | api/session   |
| zalo-personal | realtime groups | yes       | yes           | no    | no   | no            | QR/client session |

## Error classification standard
Every adapter should map failures into a small consistent set:
- AdapterAuthError: login/session invalid, password, 2FA, auth wall
- AdapterCheckpointError: challenge, suspension, verification, unusual activity
- RetryableNetworkError: timeout, net errors, target closed, transient server issues
- generic Error: unsupported UI state or bad local configuration

## Browser session conventions
When using browser automation:
- store session in `storage/sessions/<platform>/<accountId>` unless overridden
- headful by default
- allow `account.config.headless === true` to override
- use screenshot on error when possible
- detect login wall before attempting publish
- keep openContext helpers private inside adapters

## Execution strategy
- sequential execution per account and per queue item
- if one account hits checkpoint/auth failure, pause only that account
- continue with other accounts
- persist account health snapshot for UI visibility

## Recommended implementation order
1. instagram browser adapter
2. threads adapter hardening
3. Zalo personal session and group-flow hardening
4. x dual-mode support

## Notes for web-admin and API
To expose these capabilities cleanly later:
- account creation should support sessionDir-backed browser accounts
- browser-login flow can be reused for instagram, threads, and x(browser)
- account health badges should show auth state consistently across platforms
