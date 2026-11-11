"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { MapPinOff, Maximize2 } from "lucide-react";
import { defaultCenter, type SitePoint } from "./siteMapModel";

type Props = {
  tileUrl: string;
  points: SitePoint[];
  activePoint: SitePoint | null;
  isLoading: boolean;
  isResolving: boolean;
  hasError: boolean;
  onSelect: (id: string) => void;
  markerHtml: (point: SitePoint) => string;
  renderPopup: (point: SitePoint) => string;
};

export default function LeafletMapCanvas({ tileUrl, points, activePoint, isLoading, isResolving, hasError, onSelect, markerHtml, renderPopup }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; signature: string }>());
  const onSelectRef = useRef(onSelect);
  const pointsRef = useRef(points);
  const fitted = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { pointsRef.current = points; }, [points]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, { keyboard: false }).setView([defaultCenter.lat, defaultCenter.lng], 10);
      L.tileLayer(tileUrl, {
        maxZoom: 20, subdomains: "abcd",
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      }).addTo(map);
      mapRef.current = map;
      const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      observer.observe(containerRef.current);
      setMapReady(true);
      // Disconnect with the map so delayed resize callbacks cannot reach a removed map.
      map.on("unload", () => observer.disconnect());
    }).catch(() => { if (!cancelled) setMapError(true); });
    const registry = markers.current;
    return () => {
      cancelled = true;
      registry.clear();
      fitted.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [tileUrl]);

  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      const map = mapRef.current;
      if (cancelled || !map || !mapReady) return;
      const visible = new Set(points.map((point) => point.project.project_id));
      for (const [id, entry] of markers.current) {
        if (!visible.has(id)) { entry.marker.remove(); markers.current.delete(id); }
      }
      for (const point of points) {
        const id = point.project.project_id;
        const html = markerHtml(point);
        const popup = renderPopup(point);
        const title = `${id} ${point.project.name || ""}`;
        const signature = JSON.stringify([point.lat, point.lng, html, popup, title]);
        const previous = markers.current.get(id);
        if (previous?.signature === signature) continue;
        const icon = L.divIcon({ className: "", html, iconAnchor: [22, 44], iconSize: [44, 44], popupAnchor: [0, -40] });
        const zIndexOffset = point.risk === "critical" ? 300 : point.risk === "warning" ? 200 : 100;
        if (previous) {
          previous.marker.setLatLng([point.lat, point.lng]).setIcon(icon).setZIndexOffset(zIndexOffset).setPopupContent(popup);
          previous.marker.getElement()?.setAttribute("title", title);
          previous.signature = signature;
        } else {
          const marker = L.marker([point.lat, point.lng], { icon, title, zIndexOffset })
            .addTo(map).bindPopup(popup, { maxWidth: 320, minWidth: 240 })
            .on("click", () => onSelectRef.current(id));
          markers.current.set(id, { marker, signature });
        }
      }
      if (points.length && !fitted.current) {
        map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng])), { maxZoom: 15, padding: [48, 48] });
        fitted.current = true;
      }
    });
    return () => { cancelled = true; };
  }, [points, mapReady, markerHtml, renderPopup]);

  const selectedId = activePoint?.project.project_id;
  const selectedLat = activePoint?.lat;
  const selectedLng = activePoint?.lng;
  useEffect(() => {
    if (!mapReady || selectedLat === undefined || selectedLng === undefined) return;
    mapRef.current?.panTo([selectedLat, selectedLng], { animate: true });
  }, [mapReady, selectedId, selectedLat, selectedLng]);

  async function showAllSites() {
    const L = await import("leaflet");
    if (pointsRef.current.length) mapRef.current?.fitBounds(L.latLngBounds(pointsRef.current.map((point) => [point.lat, point.lng])), { maxZoom: 15, padding: [48, 48] });
  }

  const pending = !mapError && (!mapReady || isLoading || (isResolving && points.length === 0));
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-slate-200" />
      {pending && <div role="status" aria-label="กำลังเตรียมแผนที่ไซต์งาน" className="pointer-events-none absolute inset-x-4 top-4 z-[420] mx-auto max-w-sm animate-pulse rounded-2xl bg-white/95 p-4 shadow"><div className="h-4 w-2/3 rounded bg-slate-200" /><div className="mt-2 h-3 w-1/2 rounded bg-slate-100" /></div>}
      {mapError && <div role="alert" className="absolute inset-x-4 top-4 z-[420] rounded-2xl bg-white p-4 text-center text-red-700">เปิดแผนที่ไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง</div>}
      {!pending && !mapError && !hasError && points.length === 0 && <div className="pointer-events-none absolute inset-x-4 top-24 z-[420] mx-auto max-w-md rounded-[24px] border border-slate-200 bg-white/95 p-5 text-center shadow-xl"><MapPinOff className="mx-auto text-slate-400" size={36} /><h3 className="mt-2 font-black text-slate-950">ไม่มีพิกัดในตัวกรองนี้</h3><p className="mt-1 text-sm text-slate-500">ลองเปลี่ยนตัวกรอง หรือตรวจลิงก์ Google Maps ของไซต์</p></div>}
      <button type="button" onClick={() => void showAllSites()} disabled={!mapReady || !points.length} className="absolute right-4 top-4 z-[450] inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow disabled:opacity-50"><Maximize2 size={16} />แสดงทุกไซต์</button>
    </div>
  );
}
