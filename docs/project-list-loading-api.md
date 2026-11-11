# Project list loading API

The site list loads basic records first, then requests health independently for each of the 10 sites on the current page. Completed cards render immediately; a slow or failed site cannot block the other cards. Every request checks the session and filters active projects by the user's access before returning data. No credentials are cached.

## Basic records

`GET /api/projects?mode=basic`

Response: `{ "success": true, "data": [Project] }`.

Existing project fields and storage metadata are returned without reading Tasks, Daily_Reports, Project_Lifecycle or Project_Warranty. The frontend displays names, covers, dates, locations and links immediately, with skeletons for health.

GET requests read existing records without running master spreadsheet schema setup or migrations. Schema setup on write/setup routes is unchanged.

## Current-page health

`GET /api/projects?mode=health&projectId=P-1`

Response: `{ "success": true, "data": [ProjectHealth] }`.

`ProjectHealth` contains only project_id and the existing health fields: percent_done, tasks_count, completed_tasks, overdue_tasks, delay_days, progress_source, daily_reports_count, last_daily_report_date, daily_report_missing_days, daily_report_alert, lifecycle_alerts_count and lifecycle_alerts_json. Basic metadata is not sent twice. Only requested, active, accessible projects are included. Unknown or inaccessible IDs are omitted. No IDs returns an empty array; more than 10 distinct IDs returns HTTP 400. Repeated IDs are deduplicated. No session returns HTTP 401. Read failures return HTTP 500 with `{ "error": "..." }`; the existing per-site enrichment fallback remains unchanged. The API still accepts up to 10 IDs for compatibility, but the site list requests one ID at a time in parallel.

The frontend merges health by project_id and keeps basic cards usable while health loads. Health errors or a missing result show a retry action on the affected card instead of zero counts. Retrying one card only reloads that site. SWR reuses per-site requests across pages and filters. Team data loads only when an Admin selects the team-access filter. Deleting a site revalidates the basic list and updates the visible cards.

Health uses the sheet ID already present in the authorized project record, avoiding another master-project lookup. Its batch reader receives an explicit project ID so Supabase filters rows for that site even in shared-schema mode. Other batch-reader callers keep their previous behavior.

## Server cache for basic records and health

Both staged modes use Next.js Data Cache with 60-second time-based revalidation.
This uses the existing `unstable_cache` API, supported by the installed Next.js,
without enabling Cache Components across the application or adding Redis credentials.
Next.js 16 recommends Cache Components for new applications; adopting that app-wide
configuration is outside this targeted change.

The basic source records are cached before per-user filtering. Every request still
checks the session and applies the existing authorization layer before returning data.
Health is cached per project snapshot, source environment and Bangkok calendar date.
Keys isolate branch/environment, backend, database/schema and master spreadsheet.
Cache hits skip source reads and recalculation; misses still load the source.
Time-based revalidation can serve a previous result while refreshing in the background.

Cache fills read fresh Sheets rows, bypassing the older 5/10-minute in-memory caches
so a new server instance cannot refill an invalidated entry from stale local rows.
Failures are handled outside the health cache, retaining the existing response
fallback but allowing the next request to retry the source. Auth credentials and
user sessions are not stored in this cache.

Successful Projects writes expire the basic list and all health entries. Successful
Tasks, Daily_Reports, Project_Lifecycle and Project_Warranty writes expire health for
the affected project/sheet (or all health when the project is unknown). This is wired
into the existing Sheets CRUD and Supabase REST write paths, covering inserts,
updates and deletes. Invalidation uses `revalidateTag(tag, { expire: 0 })` so the next
request fetches fresh data after a write. An invalidation failure is logged without
turning a committed write into a duplicate retry. Direct database/Sheets edits outside
the application are detected by time-based revalidation, not immediate invalidation.

The two SWR hooks recheck on remount without the global two-minute deduplication
window, so returning after editing requests the invalidated server entry. Already
open screens do not receive live push updates; refresh or remount fetches new data.
Private API responses are not made publicly cacheable. Cross-instance cache sharing
depends on the deployment's Data Cache support; the real production latency and hit
rate must be measured after deployment access is granted.

## Compatibility

### Authorization read deduplication

The authorization helper accepts the caller's complete project list (or its existing
Promise). The list endpoint, site API context and server project guard reuse that
source instead of reading Projects again for Engineer/Project Manager assignments.
Staff/Foreman grants need only UserSites and Team; Projects is read only when the
effective stored member role/name requires assignment matching. Existing grants,
role aliases, active-record rules, fallback behavior and the 60-second per-user access
cache are retained. Admin already bypassed authorization table reads.

Dashboard layout, server project guards and site overview share `getCurrentSession`,
using React `cache` for one server render only. A new HTTP request obtains its own
session. API Route Handlers still check the session independently; site membership,
Admin-only actions and module guards are retained.

Credentials login reads the existing Sheets Team table directly without waiting for master-schema setup. The reader already maps existing headers in memory. Fresh account reads, disabled-account/password checks are retained; the successful-login stamp now runs through Next.js `after` after the credentials response, with failure logging; Google sign-in and setup/write flows are unchanged. This removes schema metadata/header round trips on a cold schema cache, not the time needed to validate credentials or load site records. An existing master Team table is required, as with other read-only routes.

`GET /api/projects` without a mode retains its existing uncached enrichment behavior for other consumers. Write payloads, authorization rules and pagination sizes are unchanged.

## Performance steps 3–5

The projects page streams a skeleton while the server reads the authorized basic
list, then hydrates the existing client workspace with that list. It uses the same
60-second list cache policy and invalidation tags as the API. The SWR key includes
a deterministic hash of the authorized snapshot and user identity, preventing old
browser data from replacing a newly rendered list after editing or account changes.
No duplicate basic request is made on mount when initial data exists. Failure keeps
the client fetch/retry path. Filters, controls and 10-card pagination are unchanged.

Health requests remain independent, start in visible page order and use a shared
FIFO queue with at most three requests in flight. Failure releases its slot, allowing
other sites to finish. Bound SWR mutation/retry and existing server write invalidation
remain in place; no extra cache lifetime or authentication cache is added.

Cached list-health reads project the Supabase columns needed for calculations:
tasks (identity, status, progress, type and end dates), daily report identities/dates,
and lifecycle/warranty reminder dates. Full entity reads keep their previous field
sets; Sheets fallback keeps its existing batched reads. Calculated progress and
alerts use the existing formulas. No schema, SQL migration or RPC is introduced.

Project card Drive URLs opt into `?thumbnail=card`: a WebP up to 760×460, oriented
from the source image, generated with the installed Sharp library. The smaller
result is used only if its bytes are fewer than the original. Unsupported images
fall back to the original. Original file URLs/downloads retain their bytes and MIME
type, and the existing private one-hour cache policy is kept with separate keys.

Credentials validation remains awaited and fresh. Only its existing last-login
update is scheduled with Next.js `after`; the timestamp is captured at login time
and exceptions are logged. If scheduling is unavailable, the same update is awaited.
Google sign-in profile updates/account linking remain awaited and unchanged.
