# Site map basemap configuration

The existing Leaflet map uses CARTO Voyager raster tiles. Configure the dedicated
CARTO **Basemaps** key as `CARTO_BASEMAP_API_KEY` in the server environment, not a
Workspace/API Access token. Local development reads ignored `.env.local`.

For the existing Vercel project, an Admin must add this variable for the **Preview**
environment and `zoneidea-upgrade-performance` branch (if using branch overrides),
then redeploy that branch. The key is deliberately absent from Git. No new library,
provider, project data, coordinates or permission model is introduced. UAT version
remains 1.0.001 until the next accepted version increment.

`GET /api/maps/basemap` requires the existing authenticated session and returns
`{tileUrl:string}` with `Cache-Control: private, no-store`; unauthorized requests
return 401 without configuration. The URL uses CARTO's documented `key` parameter.
The key is visible to the authorized browser tile client and to CARTO, as expected
for Basemaps; it must not be logged. Domain restrictions can be configured in CARTO.

Leaflet and configuration load concurrently. Missing configuration or a failed
configuration request keeps the previous unkeyed Voyager URL so existing pins,
zoom/pan, filtering and coordinates still work. Without a valid configured key,
CARTO may show its API-key watermark. Existing OSM/CARTO attribution is retained.

Reference: https://www.carto.com/basemaps/apikey/index.html
