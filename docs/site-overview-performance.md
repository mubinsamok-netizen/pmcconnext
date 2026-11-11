# Site overview: staged loading and narrow reads

Scope: `/dashboard/sites/[projectId]`, improvements 1–3. UAT remains 1.0.001.

## Rendering contract

The existing `getMasterProject` session, project-access and segment checks complete
before any overview stream starts. The existing per-request session memo is reused.
The page returns project identity, status, dates and header immediately after those
checks. Independent Suspense boundaries show skeletons for:

- Task progress (Tasks only).
- Weather (the existing weather reader and its cache configuration).
- Main KPI cards (Tasks plus nine primary tables).
- Calendar, activities and detailed summaries (all 18 tables).

Primary tables: Milestones, Issues, Daily_Reports, Defect_Rounds, Defect_Items,
Site_Notes, Site_Memos, Project_Lifecycle and Project_Warranty.
Secondary tables: Customer_Decisions, QC_Checklists, Materials, Weekly_Reports,
Monthly_Reports, Project_Documents, Variation_Orders and VO_Finance_Ledger.

Rows are shared inside one page request. Tasks are not reread for the KPI cards or
calendar. Each source table is requested once. Supabase requests keep project ID
and schema scoping. Sheets uses three existing batch reads (tasks, primary,
secondary), sharing one project-context/schema check. Backend fallback behavior is
unchanged. Secondary reads can run concurrently; they do not hold up task progress
or the main KPI cards. No persistent summary cache is added in this stage.

## Internal data contract

`findAllBatch(tables, sheetId, {projectId, overviewOnly:true})` opts into overview
projections; the return remains `{[tableName]: SheetRow[]}`. The optional flag defaults
to false, so existing detail screens and health-only callers retain their original
reads. `findAllSupabase` forwards this optional mode through the existing adapters.
No public endpoint or public request/response format changes.

`SITE_OVERVIEW_COLUMNS` lists selected database columns for 16 tables. Lifecycle
and warranty retain full metadata reads for their existing reminder calculations.
Unneeded photo arrays, attachments, report personnel/equipment JSON, note bodies,
approval tokens, snapshots and revision histories are not requested by this page.
Text used in existing event titles/descriptions (for example Daily Report work_done
and defect descriptions) is retained. No rows are truncated or newly paginated;
existing totals and the existing calendar's 2,500-event cap remain unchanged.
No SQL function, database schema, new dependency or data mutation is introduced.

## Preservation checks

The original summary formulas and calendar generation are moved intact to
`overviewData.ts`. Full and projected fixture reads must produce identical totals,
actions, recent items and calendar events. The primary-only computation skips the
calendar, which is built once from the complete dataset. Foreman visibility rules,
customer portal controls, navigation links and shared UI styles are retained.
A pending secondary source must not prevent the progress and main KPI results from
resolving. No new overview reads start when project authorization fails.
