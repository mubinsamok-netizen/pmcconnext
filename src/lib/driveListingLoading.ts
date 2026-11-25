import type { DriveFolderFile } from "./drive";

export type DriveListingClientPage = { success: boolean; data: DriveFolderFile[]; nextCursor: string | null; complete: boolean; error?: string };
export type DriveListingLoadError = Error & { restart?: boolean; status?: number };
const RETRY_DELAYS = [1000, 2000];

export async function fetchDriveListingPage([endpoint, , cursor]: [string, number, string | null]): Promise<DriveListingClientPage> {
  for (let attempt = 0; ; attempt++) {
    let status: number | undefined;
    let retryAfter = 0;
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json", "X-PMC-No-Global-Loading": "1" },
        body: JSON.stringify({ action: "page", cursor: cursor || undefined }),
      });
      status = response.status;
      const header = response.headers.get("Retry-After");
      if (header) retryAfter = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
      const payload = await response.json() as DriveListingClientPage;
      if (!response.ok || payload.error || !Array.isArray(payload.data)) {
        throw Object.assign(new Error(payload.error || "โหลดรายการ Drive ไม่สำเร็จ"), {
          status, restart: status === 400 && String(payload.error || "").startsWith("Invalid or expired Drive cursor"),
        });
      }
      return payload;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("โหลดรายการ Drive ไม่สำเร็จ");
      // Retry transport/timeouts, quota throttling and server failures. Never retry denied access.
      const transient = status === undefined || status === 408 || status === 429 || status >= 500;
      if (!transient || attempt >= RETRY_DELAYS.length) throw failure;
      await new Promise((resolve) => setTimeout(resolve, Math.max(RETRY_DELAYS[attempt], Math.min(15_000, retryAfter || 0))));
    }
  }
}

// Yield a paint between batches. The fallback also works when a background tab pauses RAF.
export function afterDriveListingPaint(task: () => void) {
  let cancelled = false;
  let first = 0;
  let second = 0;
  const run = () => {
    if (cancelled) return;
    cancelled = true;
    window.clearTimeout(fallback);
    window.cancelAnimationFrame(first);
    window.cancelAnimationFrame(second);
    task();
  };
  const fallback = window.setTimeout(run, 250);
  first = window.requestAnimationFrame(() => { second = window.requestAnimationFrame(run); });
  return () => {
    cancelled = true;
    window.clearTimeout(fallback);
    window.cancelAnimationFrame(first);
    window.cancelAnimationFrame(second);
  };
}
