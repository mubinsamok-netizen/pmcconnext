# Daily reports dashboard loading

Scope: the site's Daily Reports screen and an opt-in read mode on `/api/reports`.
UAT remains 1.0.001. No database migration or new dependency is introduced.

## Read API contract

`GET /api/reports?project_id={id}&view=dashboard` returns
`{success:true,data:ReportSummary[]}`. A summary contains `report_id`, `project_id`,
`date`, `weather`, `workers`, `photos_folder_id`, `document_no`, `prepared_by_name`,
`pdf_url`, `photos_month_folder_id`, `line_status` and `line_error`. Existing history,
latest-report fields, totals and PDF/photo-folder links use these fields. All report
rows are retained; no count or history is truncated. Ordering remains descending date.

Missing project ID returns 400; missing session 401; denied project access 403;
missing/inactive project 404; source errors remain 500. The existing site API guard
checks authorization before any report read. This read-only context does not run
Sheets schema setup or call Drive. It resolves the site's existing data source.

Supabase uses the existing report mapper with an opt-in dashboard column projection,
project filter and site schema. Existing full, health and overview modes are unchanged.
Sheets reads the existing Daily_Reports values once and selects the same response
fields in memory. Existing configured Supabase-to-Sheets fallback behavior is retained;
an empty successful Supabase result never triggers a fallback. No new persistent
cache is added. Legacy GETs without `view=dashboard` and the entire POST workflow
remain unchanged, including schema validation on writes, document numbering, PDF,
photo-folder creation and LINE behavior.

## UI behavior

Weekly and Monthly component bundles load only when their existing tabs are opened.
They keep existing props, permissions, requests and behavior. A reusable responsive
skeleton replaces initial daily-dashboard counts/empty rows while loading; the form
and tabs remain usable. Read errors show a retry control rather than a false empty
success. Existing SWR revalidation and post-save refresh remain in place.

The page uses the existing render-scoped session helper, shared with layout/project
authorization. No authentication is cached across requests. The submit handler saves
the form reference before its first await, allowing its existing reset/refetch flow
to complete after a successful save when the React event's currentTarget is cleared.
A failed dashboard refresh after saving preserves the success confirmation and exposes the existing retry instead of reporting a failed save. No POST fields, upload route, PDF content or LINE destination are changed.

## Verification and performance limits

Tests use only synthetic TestbyZoneIdea rows. They cover authorized/denied reads,
backend selection and fallback, projected/full compatibility, visible report data,
loading/error/form states, deferred tabs, and a successful asynchronous form reset.
Live QA is restricted to PMC-20261113-TestbyZoneIdea with LINE disabled.

The pre-change empty-site report API requests measured 4.86 s, 1.42 s and 0.388 s.
These are API durations, not click-to-complete-page times. Server cold starts/caches,
network variability and the empty test dataset limit comparisons; removing schema
checks and large unused fields does not guarantee the same speedup on every request.
