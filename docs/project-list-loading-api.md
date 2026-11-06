# Project list loading API

The site list loads basic records first, then requests health for the current page (10 sites). Every request checks the session and filters active projects by the user's access before returning data. No credentials are cached.

## Basic records

`GET /api/projects?mode=basic`

Response: `{ "success": true, "data": [Project] }`.

Existing project fields and storage metadata are returned without reading Tasks, Daily_Reports, Project_Lifecycle or Project_Warranty. The frontend displays names, covers, dates, locations and links immediately, with skeletons for health.

GET requests read existing records without running master spreadsheet schema setup or migrations. Schema setup on write/setup routes is unchanged.

## Current-page health

`GET /api/projects?mode=health&projectId=P-1&projectId=P-2`

Response: `{ "success": true, "data": [ProjectWithHealth] }`.

`ProjectWithHealth` retains the existing enriched project fields: percent_done, tasks_count, completed_tasks, overdue_tasks, delay_days, daily report and lifecycle alerts. Only requested, active, accessible projects are included. Unknown or inaccessible IDs are omitted. No IDs returns an empty array; more than 10 distinct IDs returns HTTP 400. Repeated IDs are deduplicated. No session returns HTTP 401. Read failures return HTTP 500 with `{ "error": "..." }`; the existing per-site enrichment fallback remains unchanged.

The frontend merges health by project_id and keeps basic cards usable while health loads. Health errors show a retry action instead of zero counts. Changing page or filters requests health for the new visible IDs. Team data loads only when an Admin selects the team-access filter. Deleting a site revalidates the basic list and updates the health request IDs.

Health uses the sheet ID already present in the authorized project record, avoiding another master-project lookup. Its batch reader receives an explicit project ID so Supabase filters rows for that site even in shared-schema mode; Google Sheets continues using the existing batch read/cache. Other batch-reader callers keep their previous behavior.

## Compatibility

`GET /api/projects` without a mode retains its existing behavior for other consumers. Writes, authorization rules, pagination sizes and file endpoints are unchanged. Both stages use the existing SWR behavior; this is not a cross-request server health cache.
