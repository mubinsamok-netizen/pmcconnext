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

Health uses the sheet ID already present in the authorized project record, avoiding another master-project lookup. Its batch reader receives an explicit project ID so Supabase filters rows for that site even in shared-schema mode; Google Sheets continues using the existing batch read/cache. Other batch-reader callers keep their previous behavior.

## Compatibility

`GET /api/projects` without a mode retains its existing behavior for other consumers. Writes, authorization rules, pagination sizes and file endpoints are unchanged. Both stages use the existing SWR behavior; this is not a cross-request server health cache.
