"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWRInfinite from "swr/infinite";
import type { DriveFolderFile } from "@/lib/drive";

import { afterDriveListingPaint, fetchDriveListingPage, type DriveListingClientPage as Page, type DriveListingLoadError } from "./driveListingLoading";

export function useDriveFiles(endpoint: string | null) {
  const [startedEndpoint, setStartedEndpoint] = useState<string | null>(null);
  const ready = Boolean(endpoint && startedEndpoint === endpoint);
  useEffect(() => {
    if (endpoint) return afterDriveListingPaint(() => setStartedEndpoint(endpoint));
  }, [endpoint]);
  const [generation, setGeneration] = useState(0);
  const [retained, setRetained] = useState<{ endpoint: string | null; files: DriveFolderFile[] }>({ endpoint: null, files: [] });
  const [restarts, setRestarts] = useState<{ endpoint: string | null; count: number }>({ endpoint: null, count: 0 });
  const [restartingEndpoint, setRestartingEndpoint] = useState<string | null>(null);
  const { data: pages, error, isValidating, setSize, mutate } = useSWRInfinite<Page, DriveListingLoadError>(
    (_index, previous: Page | null) => {
      if (!ready || !endpoint || (previous && !previous.nextCursor)) return null;
      return [endpoint, generation, previous?.nextCursor || null];
    }, fetchDriveListingPage,
    { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateFirstPage: false, shouldRetryOnError: false, dedupingInterval: 60_000 },
  );
  const last = pages?.[pages.length - 1];
  const complete = !endpoint || Boolean(last?.complete);
  // Continue automatically, but render each completed batch immediately.
  useEffect(() => {
    if (ready && !error && last?.nextCursor && !isValidating) {
      return afterDriveListingPaint(() => { void setSize((pages?.length || 0) + 1).catch(() => undefined); });
    }
  }, [ready, error, last?.nextCursor, isValidating, pages?.length, setSize]);
  const files = useMemo(() => {
    const merged = new Map<string, DriveFolderFile>();
    if (!complete && retained.endpoint === endpoint) retained.files.forEach((file) => merged.set(file.id, file));
    pages?.forEach((page) => page.data.forEach((file) => merged.set(file.id, file)));
    return Array.from(merged.values());
  }, [pages, retained, complete, endpoint]);

  const restartListing = useCallback(async () => {
    if (!endpoint) return;
    const response = await fetch(endpoint, { method: "POST", headers: { "X-PMC-No-Global-Loading": "1" } });
    if (!response.ok) throw new Error("รีเฟรชรายการ Drive ไม่สำเร็จ");
    setRetained({ endpoint, files });
    setGeneration((value) => value + 1);
  }, [endpoint, files]);
  const restartCount = restarts.endpoint === endpoint ? restarts.count : 0;
  const automaticRestart = Boolean(endpoint && error?.restart && restartCount < 2);
  const restarting = Boolean(endpoint && restartingEndpoint === endpoint);
  useEffect(() => {
    if (!automaticRestart || isValidating || restarting) return;
    return afterDriveListingPaint(() => {
      setRestarts({ endpoint, count: restartCount + 1 });
      setRestartingEndpoint(endpoint);
      void restartListing().catch(() => {
        setRestarts({ endpoint, count: 2 });
      }).finally(() => setRestartingEndpoint(null));
    });
  }, [automaticRestart, isValidating, restarting, endpoint, restartCount, restartListing]);
  const refresh = useCallback(async () => {
    setRestarts({ endpoint, count: 0 });
    await restartListing();
  }, [endpoint, restartListing]);
  return {
    data: { data: files, complete }, error: automaticRestart || restarting ? undefined : error,
    isLoading: Boolean(endpoint) && !complete && (!error || automaticRestart || restarting),
    refresh,
    retry: () => {
      // Expired/invalid continuations must restart rather than retry the same cursor.
      const resume = error?.restart ? refresh() : mutate(pages || [], {
        revalidate: (page, key) => !page || (Array.isArray(key) && key[2] === (last?.nextCursor || null)),
      });
      void resume.catch(() => undefined);
    },
  };
}
