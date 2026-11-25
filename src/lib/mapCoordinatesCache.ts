import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";

type Coordinates = { lat: number; lng: number };
const pending = new Map<string, Promise<Coordinates | null>>();

// Only successful resolutions enter the persistent cache. A changed link has a new key.
export function readCachedMapCoordinates(link: string, load: () => Promise<Coordinates | null>): Promise<Coordinates | null> {
  const key = createHash("sha256").update(link).digest("hex");
  const existing = pending.get(key);
  if (existing) return existing;
  const read = unstable_cache(async () => {
    const coordinates = await load();
    if (!coordinates) throw new Error("Map link has no resolved coordinates");
    return coordinates;
  }, ["pmc-map-coordinates-v1", key], { revalidate: 86_400 });
  const request = read().catch(() => null).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
