import type * as Leaflet from "leaflet";
import { getRiskColor, type Coordinates, type SitePoint } from "./siteMapModel";

type MarkerEntry = {
  marker: Leaflet.Marker;
  lat: number;
  lng: number;
  iconHtml: string;
  popupHtml: string;
  popup: HTMLElement;
  title: string;
  risk: SitePoint["risk"];
};
export type SiteMapMarkers = Map<string, MarkerEntry>;

export function syncSiteMapMarkers(
  L: typeof Leaflet, map: Leaflet.Map, registry: SiteMapMarkers, points: SitePoint[],
  markerHtml: (point: SitePoint) => string, renderPopup: (point: SitePoint) => string,
  onSelect: (id: string) => void,
) {
  const visible = new Set(points.map((point) => point.project.project_id));
  for (const [id, entry] of registry) {
    if (!visible.has(id)) { entry.marker.remove(); registry.delete(id); }
  }
  for (const point of points) {
    const id = point.project.project_id;
    const html = markerHtml(point);
    const popupHtml = renderPopup(point);
    const title = `${id} ${point.project.name || ""}`;
    const zIndexOffset = point.risk === "critical" ? 300 : point.risk === "warning" ? 200 : 100;
    let entry = registry.get(id);
    const icon = () => L.divIcon({ className: "", html, iconAnchor: [22, 44], iconSize: [44, 44], popupAnchor: [0, -40] });
    if (!entry) {
      const popup = document.createElement("div");
      popup.innerHTML = popupHtml;
      const marker = L.marker([point.lat, point.lng], { icon: icon(), title, zIndexOffset, autoPanOnFocus: false })
        .addTo(map).bindPopup(popup, { maxWidth: 320, minWidth: 240, autoPan: false })
        .on("click", () => onSelect(id));
      entry = { marker, lat: point.lat, lng: point.lng, iconHtml: html, popupHtml, popup, title, risk: point.risk };
      registry.set(id, entry);
    } else {
      if (entry.lat !== point.lat || entry.lng !== point.lng) entry.marker.setLatLng([point.lat, point.lng]);
      if (entry.iconHtml !== html) entry.marker.setIcon(icon());
      // Keep the open Leaflet popup and marker DOM; avoid setPopupContent's layout/auto-pan cycle.
      if (entry.popupHtml !== popupHtml) entry.popup.innerHTML = popupHtml;
      if (entry.risk !== point.risk) entry.marker.setZIndexOffset(zIndexOffset);
      if (entry.title !== title) entry.marker.getElement()?.setAttribute("title", title);
      Object.assign(entry, { lat: point.lat, lng: point.lng, iconHtml: html, popupHtml, title, risk: point.risk });
    }
    const dot = entry.marker.getElement()?.querySelector<HTMLElement>("[data-map-risk-dot]");
    if (dot && dot.style.backgroundColor !== getRiskColor(point.risk)) dot.style.backgroundColor = getRiskColor(point.risk);
  }
}

export function fitSiteMapBounds(L: typeof Leaflet, map: Leaflet.Map, points: SitePoint[], focus?: Coordinates | null) {
  if (!points.length) return;
  const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
  const previousZoom = Math.min(15, map.getBoundsZoom(bounds, false, L.point(96, 96)));
  const zoom = Math.max(map.getMinZoom(), previousZoom - 1);
  map.setView(focus ? [focus.lat, focus.lng] : bounds.getCenter(), zoom, { animate: false });
}
