# Site map basemap configuration

The existing Leaflet map uses CARTO Voyager raster tiles. At the user's explicit
request, the dedicated browser Basemaps key is configured as the project default
in `src/app/api/maps/basemap/route.ts`. No Vercel environment setup is required.
`CARTO_BASEMAP_API_KEY` remains an optional nonblank deployment override; local
`.env.local` is ignored by Git. Workspace/API Access tokens are not used.

No new library, provider, project data, coordinates or permission model is introduced.
UAT version remains 1.0.001 until the next accepted version increment.

`GET /api/maps/basemap` requires the existing authenticated session and returns
`{tileUrl:string}` with `Cache-Control: private, no-store`; unauthorized requests
return 401 without configuration. The URL uses CARTO's documented `key` parameter.
The key is visible to the authorized browser tile client and to CARTO, as expected
for Basemaps; it must not be logged. Domain restrictions can be configured in CARTO.

Leaflet and configuration load concurrently. Missing environment configuration
uses the project key. A failed configuration request keeps the previous unkeyed
Voyager URL so existing pins, zoom/pan, filtering and coordinates still work.
Existing OSM/CARTO attribution is retained.

Reference: https://www.carto.com/basemaps/apikey/index.html
