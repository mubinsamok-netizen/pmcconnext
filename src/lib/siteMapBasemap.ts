// This is a browser Basemaps key, not a CARTO Workspace credential.
export function getSiteMapTileUrl() {
  const key = process.env.CARTO_BASEMAP_API_KEY?.trim() || "cb1_56ny_1_1f810891e72d45f70f71b0c1";
  return `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`;
}
