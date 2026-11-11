import { revalidateTag, unstable_cache } from "next/cache";
import { listDriveFolderFiles, type DriveFolderFile } from "./drive";

// Same Data Cache API as projectListCache; Drive listings are slow, so reuse them briefly.
const CACHE_SECONDS = 60;
const LIST_OPTIONS = { recursive: true, maxDepth: 4, pageSize: 500, maxFiles: 500 };

function tag(folderId: string) {
  return `pmc-drive-files-v1:${process.env.VERCEL_ENV || "local"}:${folderId}`;
}

export function invalidateDriveFilesCache(folderId: string) {
  try {
    revalidateTag(tag(folderId), { expire: 0 });
    return true;
  } catch (error) {
    console.error("Drive file cache invalidation failed; entries expire after 60 seconds", error);
    return false;
  }
}

export async function readDriveFolderFiles(folderId: string, fresh = false): Promise<DriveFolderFile[]> {
  const load = () => listDriveFolderFiles(folderId, LIST_OPTIONS);
  if (fresh) {
    // Legacy callers still get a direct, fresh read. The files workspace uses
    // POST invalidation followed by a separate GET to refill the shared cache.
    const files = await load();
    invalidateDriveFilesCache(folderId);
    return files;
  }
  return unstable_cache(load, [tag(folderId)], { revalidate: CACHE_SECONDS, tags: [tag(folderId)] })();
}
