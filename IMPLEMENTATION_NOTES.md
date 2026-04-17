# Facebook Manual-Scheduling MVP — Implementation Notes

## Summary of Changes

### 1. Database Schema (`packages/db/prisma/schema.prisma`)
Six new models added:
- **`FbCampaign`** — Batch campaign with `postsPerDay` and `startDate`
- **`FbPost`** — Individual post (`feed | story | reel`) with caption and status
- **`FbPostMedia`** — Media files attached to a post (local filesystem paths)
- **`FbPostTarget`** — Per-account schedule within a post (`fixed | random` mode)
- **`FbPostComment`** — Comments to be added after publishing (with delay)
- **`FbExecution`** — Execution audit log per post-target pair

`TargetAccount` got a new `fbPostTargets FbPostTarget[]` back-relation.

### 2. Facebook Adapter (`packages/adapters/src/platforms/facebook.ts`)
Extended with:
- `publishFb(input)` — Dispatches to `_publishFeed`, `_publishStory`, or `_publishReel`
- `addComment(input)` — Navigates to post URL and submits a comment
- `_screenshot()` — Saves a screenshot on error to `storage/screenshots/`

The original `publish()` method is preserved for backward compatibility (routes to `publishFeed`).

### 3. Worker Types (`packages/worker-core/src/types.ts`)
- Added `QueueName.FbPost = "fb-post"` and `JobName.FbPostExecute`
- Added `fbPostJobSchema` with `kind: "post" | "comment"` discriminator so both post execution and delayed comment posting use the same queue

### 4. Worker Infrastructure (`packages/worker-core/src/runtime.ts`)
- New `fb-post` BullMQ queue
- Worker created with **`concurrency: 1`** (sequential, no parallel Facebook automation)
- `scheduleFbPost(targetId, scheduledAt)` exposed on WorkerCore public API

### 5. Processor (`packages/worker-core/src/processors/fb-post.ts`)
- Validates media count rules (story=1 image, reel=1 video) before executing
- Pauses TargetAccount on `AdapterAuthError`/`AdapterCheckpointError` (account safety)
- Saves `screenshotPath` in FbExecution on failure
- Schedules comments as delayed `kind="comment"` jobs after successful posting
- Does **not** rethrow auth errors (prevents BullMQ from retrying)
- Retryable network errors are rethrown (BullMQ handles 3 attempts with exponential backoff)

### 6. API Routes (`apps/api/src/app.ts`)
New endpoints under `/api/v1/facebook/`:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/facebook/campaigns` | List all campaigns |
| POST | `/facebook/campaigns` | Create campaign |
| GET | `/facebook/campaigns/:id` | Get campaign with posts |
| PUT | `/facebook/campaigns/:id` | Update campaign |
| DELETE | `/facebook/campaigns/:id` | Delete campaign |
| POST | `/facebook/campaigns/:id/schedule` | Distribute & schedule all posts |
| POST | `/facebook/campaigns/:id/import` | Batch import up to 100 posts |
| GET | `/facebook/posts` | List posts (filterable by campaignId/status) |
| POST | `/facebook/posts` | Create individual post |
| GET | `/facebook/posts/:id` | Get post detail |
| PUT | `/facebook/posts/:id` | Update post |
| DELETE | `/facebook/posts/:id` | Delete post |

### 7. Web Admin (`apps/web-admin/src/pages/FacebookCampaignsPage.tsx`)
Basic campaign management page:
- Campaign list with status badge, post count, schedule action
- Inline create form (name, description, posts/day, start date)
- "Lên lịch" button triggers scheduling (only in `draft` state)
- Route: `/facebook/campaigns`
- Navigation item added to sidebar

---

## Assumptions Made

1. **Media storage**: Media files are stored on the local filesystem (`storage/fb-media/`). The `localPath` field in `FbPostMedia` is an absolute or relative path Playwright can access. No cloud storage integration in this MVP.

2. **Facebook UI automation**: Playwright selectors target both English and Vietnamese Facebook UI. Facebook's DOM changes frequently — selectors may need tuning per locale/version. Story and Reel flows assume the standard Facebook web UI.

3. **Session persistence**: Each `TargetAccount` with `credentials.sessionDir` stores a persistent Playwright browser context. Sessions must be bootstrapped manually (login once headfully, then reuse).

4. **Sequential execution**: The `fb-post` BullMQ worker runs with `concurrency: 1`. All post-target jobs queue behind each other globally (not per-account). If per-account isolation is needed in the future, a separate queue per account can be created.

5. **Comment scheduling**: Comments are re-enqueued as delayed BullMQ jobs on the same `fb-post` queue. Delay is cumulative (comment 1 at +5 min, comment 2 at +10 min, etc.). The post URL is passed through the job payload.

6. **Random schedule window**: `windowStart` / `windowEnd` are stored as `HH:MM` strings. The random time is resolved at campaign scheduling time (not at execution time), so the scheduled time is deterministic once set.

7. **Post ordering in batch distribution**: Posts are distributed in creation order. Day 1 gets posts 0..postsPerDay-1, day 2 gets postsPerDay..2*postsPerDay-1, etc.

8. **100-post import limit**: Enforced at the API layer. Larger batches require multiple API calls.

9. **No media upload endpoint yet**: The import endpoint accepts `localPath` strings directly. A multipart upload endpoint for FB media would be a natural next step.

10. **`Facebook` icon in Lucide**: Uses `Facebook` icon from lucide-react (available in v0.562+).

---

## Blockers / Known Gaps

1. **Prisma migration not auto-generated** — Run `npx prisma migrate dev --name fb_campaign_system` in `packages/db/` after confirming the schema.

2. **Media upload API missing** — There is no endpoint to upload media files for FB posts. Currently `localPath` must be set manually or through a separate file upload flow.

3. **Campaign detail page** — The `/facebook/campaigns/:id` route referenced in `FacebookCampaignsPage.tsx` links to a detail page that is not yet implemented. Creating/viewing individual posts requires the API directly.

4. **Facebook Story/Reel selectors** — Story and Reel Playwright flows use best-effort selectors. These need manual testing on live Facebook sessions since the UI varies by account type (personal vs. Page), locale, and A/B tests.

5. **`apiPost` used for GET** — The campaigns list page uses a raw `fetch` call because the client only has `apiPost`/`apiGet` helpers; `apiGet` is available but the query was initially written incorrectly. The raw fetch works but is inconsistent — should be refactored to use `apiGet`.

---

## Running the Migration

```bash
cd packages/db
npx prisma migrate dev --name fb_campaign_system
npx prisma generate
```

Restart the API and worker after migration.
