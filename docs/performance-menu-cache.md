# Menu data cache and authorization

Applies to the menus in System_Analyst.pdf. UAT release remains v1.0.001.

## Existing API contract

URLs, HTTP methods, request bodies and success/error payload fields are unchanged.
Scoped reads authenticate the current session and check site access before looking up
cached data. Cache entries contain data, not sessions or HTTP responses. The global
legacy Tasks/Milestones/Reports reads remain uncached. Cache scope includes branch,
backend configuration, project ID, workspace ID and view. No additional credentials
or external cache service is required.

## Lifetimes

| Read | Lifetime |
| --- | --- |
| Shared project catalog and project health | 60 seconds |
| Site access grants | 60 seconds maximum; expired grants are checked against the source |
| Sales CRM / site filter Team list | 60 seconds |
| Contractors / labor rates | 120 seconds |
| Overview input batches, reports, Memo, notes, Defect, QC, VO, Tasks, Milestones, decisions | 30 seconds |
| Lifecycle / warranty | 60 seconds |
| Drive listings, including paged traversal | Existing 60 seconds |
| Coordinates | Existing 24 hours |
| Drive cover/image responses | Existing private browser cache and instance cache, 1 hour |

Overview keeps Tasks, primary and secondary streams separate. Date-dependent KPI
calculations still run with the current date. Weekly/monthly report previews include
actor details and are not shared; only their list reads are cached. Default decision
row creation stays outside the cached callback. Upload URLs, duplicate checks,
confirmation, approval and PDF creation are not cached.

## Invalidation

Successful Sheets writes invalidate by spreadsheet ID. Successful Supabase writes
invalidate by returned project IDs and schema ID. Both expire tags immediately with
`revalidateTag(tag, { expire: 0 })`, including all dependent overview/list views for
that site. Project changes invalidate the catalog and dependent site snapshots.
Team/UserSites changes invalidate shared grants and the relevant master cache;
Postgres and Sheets table aliases map to the same tag. Login timestamp-only updates invalidate the staff list without flushing grants or site snapshots. Cache failures are logged and
do not convert a successful write into a retry/duplicate write. Reads filling a
shared cache bypass older in-process Sheets snapshots.

Existing Drive refresh retains visible files during full recursive traversal;
manual refresh and post-upload refresh still invalidate the Drive listing tags.
Existing image cover keys use Drive file IDs, so replacing a cover uses a new key.
Direct edits outside the app are seen after the corresponding cache refresh; no
webhook for external database/Sheets/Drive changes is added here.

## Session and schema checks

The Dashboard provider receives the session already read by its server layout, avoiding an
additional initial client session fetch. The public/login root stays synchronous. React memoization shares this lookup within
one render only. The daily-report save path supplies its already-verified session
to the site-context helper, which still checks site access. Other API requests keep
their own session checks. Read-only GETs no longer run schema initialization; write
and project creation paths retain it. Decisions retain their initialization path
because opening an empty workspace seeds the default rows.

## Validation

`node --test tests/menu-data-cache.test.cjs` exercises site/view isolation, scoped
invalidation, backend table aliases, expired/revoked grants, errors, and an API cache
hit blocked after access is revoked. It uses mocked storage and does not change
customer data. These checks do not establish a real-world speed improvement; cold
and warm Preview timings must be measured separately.
