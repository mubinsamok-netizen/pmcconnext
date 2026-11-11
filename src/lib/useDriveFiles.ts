"use client";

import { useEffect, useMemo, useState } from "react";
import useSWRInfinite from "swr/infinite";
import type { DriveFolderFile } from "@/lib/drive";

type Page = { success: boolean; data: DriveFolderFile[]; nextCursor: string | null; complete: boolean; error?: string };

async function fetchPage([endpoint, , cursor]: [string, number, string | null]): Promise<Page> {
  const response = await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "page", cursor: cursor || undefined }),
  });
  const payload = await response.json() as Page;
  if (!response.ok || payload.error || !Array.isArray(payload.data)) throw Object.assign(new Error(payload.error || "โหลดรายการ Drive ไม่สำเร็จ"), { restart: response.status === 400 });
  return payload;
}

export function useDriveFiles(endpoint: string | null) {
  const [generation, setGeneration] = useState(0);
  const [retained, setRetained] = useState<{ endpoint: string | null; files: DriveFolderFile[] }>({ endpoint: null, files: [] });
  const { data: pages, error, isValidating, setSize, mutate } = useSWRInfinite<Page>(
    (_index, previous: Page | null) => {
      if (!endpoint || (previous && !previous.nextCursor)) return null;
      return [endpoint, generation, previous?.nextCursor || null];
    }, fetchPage,
    { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateFirstPage: false, shouldRetryOnError: false, dedupingInterval: 60_000 },
  );
  const last = pages?.[pages.length - 1];
  const complete = !endpoint || Boolean(last?.complete);
  // Continue automatically, but render each completed batch immediately.
  useEffect(() => {
    if (!error && last?.nextCursor && !isValidating) void setSize((pages?.length || 0) + 1).catch(() => undefined);
  }, [error, last?.nextCursor, isValidating, pages?.length, setSize]);
  const files = useMemo(() => {
    const merged = new Map<string, DriveFolderFile>();
    if (!complete && retained.endpoint === endpoint) retained.files.forEach((file) => merged.set(file.id, file));
    pages?.forEach((page) => page.data.forEach((file) => merged.set(file.id, file)));
    return Array.from(merged.values());
  }, [pages, retained, complete, endpoint]);

  const refresh = async () => {
    if (!endpoint) return;
    const response = await fetch(endpoint, { method: "POST" });
    if (!response.ok) throw new Error("รีเฟรชรายการ Drive ไม่สำเร็จ");
    setRetained({ endpoint, files });
    setGeneration((value) => value + 1);
  };
  return {
    data: { data: files, complete }, error,
    isLoading: Boolean(endpoint) && !error && !complete,
    refresh,
    retry: () => {
      // Expired/invalid continuations must restart rather than retry the same cursor.
      const resume = error?.restart ? refresh() : mutate();
      void resume.catch(() => undefined);
    },
  };
}
