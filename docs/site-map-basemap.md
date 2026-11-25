# Site map performance and basemap configuration

Scope: `/dashboard/site-map` only. UAT remains 1.0.001 until the next accepted
version increment. No site, task, report, Drive file or database schema is changed.

## Loading flow

1. The existing authenticated dashboard renders the CARTO tile URL as a server
   prop. Leaflet no longer waits for an extra basemap HTTP request.
2. `GET /api/projects?mode=basic` supplies authorized site metadata using the
   existing project list cache. No all-site progress computation is requested.
3. Coordinates embedded in site links render immediately. Short links resolve in
   batches of four, at most three requests concurrently. Each completed batch
   publishes its pins without waiting for other batches. Requests abort on unmount
   or link changes; health updates and filtering do not repeat coordinate lookups.
4. On entry, the newest authorized site **with usable coordinates** is selected using `created_at` (natural
   descending project ID is a deterministic fallback for absent/equal timestamps).
   Only that site and later explicit pin/list selections request
   `GET /api/projects?mode=health&projectId=<selected-id>`. The existing API checks
   session and site authorization and uses its existing 60-second health cache.
   SWR reuses per-site results. Switching sites cannot display the previous site's
   health. Failures have a per-site retry button.
5. Unrequested progress/risk is unknown, never assumed to be 0% or normal. Risk
   filtering and the critical summary describe only sites whose details have
   loaded; the overview explains the loaded count. Status/engineer/search filters
   still apply to all authorized sites. There is no background all-site health read. Supabase project mapping now retains
   the existing `created_at` value without another query or schema change. If the
   newest site has no usable coordinates, selection falls back to the next-newest
   located site and loads only that site's health. Pending newer short links settle
   before choosing an older fallback, avoiding temporary health requests and focus
   jumps. If no site has coordinates, no automatic health request is made; manual
   list selection still supports viewing a site without coordinates.

## Coordinate cache and API contract

Existing authenticated `POST /api/maps/coordinates` accepts
`{items:[{project_id:string,site_link:string}]}` (legacy `links` remains supported),
up to 40 entries. Response remains
`{success:true,data:[{project_id:string,coordinates:{lat:number,lng:number}|null}]}`.
Unauthorized requests return 401. The frontend uses batches of four; the API's
existing request limit and eight-second per-link timeout remain unchanged.

Successful resolutions use the existing Next.js Data Cache mechanism for 24 hours,
keyed by SHA-256 of the exact link; editing a link therefore misses the old entry.
Concurrent identical lookups share an in-flight promise. Null/error resolutions
are not persisted on the server. The bounded, in-memory browser cache holds at most
500 links, with a 24-hour success TTL and a one-minute negative TTL. It does not
write locations to localStorage. Auth is performed outside the cache. These links
are public map destinations; no user/session data is part of cached values.

## Map rendering and loading states

Markers are retained by project ID. Health updates change the risk dot and popup
content in place, without replacing icons, rebinding popups or resetting positions.
Only genuinely changed engineer icons or coordinates invoke their Leaflet setters.
Popup auto-pan is disabled; a single selection effect controls map movement. Health updates do not recenter the map; selection pans to that site.
Initial pins fit once at one zoom level wider than before, centered on the newest
site when its coordinates are available. Initial fitting waits for coordinate
batches to settle so a tiny first batch cannot cause an excessive zoom-in. Ready
pins remain visible and selectable during that lookup. Later filters/coordinate batches preserve the user's view;
`แสดงทุกไซต์` explicitly fits the current visible pins. Popup contents update when
health arrives. ResizeObserver maintains the canvas size without delayed timers.
Skeleton states distinguish initial loading from genuinely missing coordinates.
Ready pins remain usable while other coordinates load. Coordinate request failures
have a retry control rather than being reported as confirmed missing coordinates.

## CARTO key compatibility

`src/lib/siteMapBasemap.ts` supplies the explicitly authorized public Basemaps key.
`CARTO_BASEMAP_API_KEY` remains an optional nonblank deployment override. Workspace
API Access tokens are not used. Existing OSM/CARTO attribution is retained.

`GET /api/maps/basemap` remains available for compatibility: authenticated sessions
receive `{tileUrl:string}` with `Cache-Control: private, no-store`; unauthenticated
requests receive 401. The map itself no longer calls this endpoint.
The browser Basemaps key is visible in tile requests as expected and must not be
logged. No new dependency or external provider is introduced.
