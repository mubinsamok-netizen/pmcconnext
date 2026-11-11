"use client";

import { useEffect, useMemo, useState } from "react";
import { extractCoordinatesFromMapLink, type Coordinates, type Project } from "./siteMapModel";

type Entry = { coordinates: Coordinates | null; expiresAt: number };
const cache = new Map<string, Entry>();
const SUCCESS_TTL = 86_400_000;
const MISSING_TTL = 60_000;
const BATCH_SIZE = 4;
const CONCURRENCY = 3;

export function useSiteMapCoordinates(projects: Project[]) {
  const [resolved, setResolved] = useState<Record<string, Entry>>(() => Object.fromEntries(projects.flatMap((project) => {
    const link = project.site_link || "";
    const entry = cache.get(link);
    return entry && entry.expiresAt > Date.now() ? [[link, entry]] : [];
  })));
  const [failedLinks, setFailedLinks] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  // Depend on link identities, not changing health/filter/selection objects.
  const signature = JSON.stringify(projects.filter((project) => project.site_link && !extractCoordinatesFromMapLink(project.site_link)).map((project) => [project.project_id, project.site_link]));

  useEffect(() => {
    const links: [string, string][] = JSON.parse(signature);
    if (!links.length) return;
    const controller = new AbortController();
    const cached: Record<string, Entry> = {};
    const missing = links.filter(([, link]) => {
      const entry = cache.get(link);
      if (entry && entry.expiresAt > Date.now()) { cached[link] = entry; return false; }
      return true;
    });
    if (Object.keys(cached).length) void Promise.resolve().then(() => {
      if (!controller.signal.aborted) setResolved((current) => Object.entries(cached).every(([link, entry]) => current[link] === entry) ? current : { ...current, ...cached });
    });
    const batches = Array.from({ length: Math.ceil(missing.length / BATCH_SIZE) }, (_, index) => missing.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
    let cursor = 0;
    async function worker() {
      while (!controller.signal.aborted && cursor < batches.length) {
        const batch = batches[cursor++];
        try {
          const response = await fetch("/api/maps/coordinates", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({ items: batch.map(([project_id, site_link]) => ({ project_id, site_link })) }),
          });
          const json = await response.json();
          if (!response.ok || !json.success || !Array.isArray(json.data)) throw new Error("Coordinate lookup failed");
          if (controller.signal.aborted) return;
          const entries: Record<string, Entry> = {};
          for (const [id, link] of batch) {
            const value = json.data.find((item: { project_id: string }) => item.project_id === id)?.coordinates;
            const coordinates = value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180 ? value : null;
            const entry = { coordinates, expiresAt: Date.now() + (coordinates ? SUCCESS_TTL : MISSING_TTL) };
            entries[link] = entry;
            cache.delete(link);
            cache.set(link, entry);
          }
          while (cache.size > 500) cache.delete(cache.keys().next().value!);
          setResolved((current) => ({ ...current, ...entries }));
        } catch {
          if (!controller.signal.aborted) setFailedLinks((current) => [...new Set([...current, ...batch.map(([, link]) => link)])]);
        }
      }
    }
    for (let index = 0; index < Math.min(CONCURRENCY, batches.length); index++) void worker();
    return () => controller.abort();
  }, [signature, retry]);

  const links: [string, string][] = useMemo(() => JSON.parse(signature), [signature]);
  const resolvedCoordinates = useMemo(() => Object.fromEntries(links.flatMap(([id, link]) => resolved[link]?.coordinates ? [[id, resolved[link].coordinates]] : [])), [links, resolved]);
  const pendingProjectIds = useMemo(() => links.filter(([, link]) => !resolved[link] && !failedLinks.includes(link)).map(([id]) => id), [links, resolved, failedLinks]);
  const isResolving = pendingProjectIds.length > 0;
  const hasError = links.some(([, link]) => failedLinks.includes(link));
  return { resolvedCoordinates, pendingProjectIds, isResolving, coordinatesError: hasError, retryCoordinates: () => { setFailedLinks([]); setRetry((current) => current + 1); } };
}
