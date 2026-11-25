"use client";

import { useState } from "react";

export function usePagination<T>(items: T[], pageSize: number, resetKey: string) {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = selection.key === resetKey ? Math.min(selection.page, pageCount) : 1;

  // Reset filters and clamp shrinking results before rendering a stale or empty page.
  if (selection.key !== resetKey || selection.page !== page) {
    setSelection({ key: resetKey, page });
  }

  return {
    page,
    pageSize,
    total: items.length,
    items: items.slice((page - 1) * pageSize, page * pageSize),
    setPage: (nextPage: number) => setSelection({
      key: resetKey,
      page: Math.max(1, Math.min(nextPage, pageCount)),
    }),
  };
}
