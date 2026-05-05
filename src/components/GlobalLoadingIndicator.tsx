"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const INTERACTION_WINDOW_MS = 1400;
const SHOW_DELAY_MS = 120;
const MAX_VISIBLE_MS = 9000;

function isSameAppNavigation(anchor: HTMLAnchorElement) {
  if (anchor.target || anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

export default function GlobalLoadingIndicator() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const activeRequestsRef = useRef(0);
  const interactionAtRef = useRef(0);
  const showTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const navigationPendingRef = useRef(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimerRef.current === null) return;
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    };

    const clearMaxTimer = () => {
      if (maxTimerRef.current === null) return;
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    };

    const hideLoader = () => {
      clearShowTimer();
      clearMaxTimer();
      navigationPendingRef.current = false;
      activeRequestsRef.current = 0;
      visibleRef.current = false;
      setVisible(false);
    };

    const queueLoader = () => {
      if (visibleRef.current || showTimerRef.current !== null) return;

      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        visibleRef.current = true;
        setVisible(true);
      }, SHOW_DELAY_MS);

      clearMaxTimer();
      maxTimerRef.current = window.setTimeout(hideLoader, MAX_VISIBLE_MS);
    };

    const finishOneRequest = () => {
      activeRequestsRef.current = Math.max(0, activeRequestsRef.current - 1);
      if (activeRequestsRef.current === 0 && !navigationPendingRef.current) {
        hideLoader();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest("button, a, input, select, textarea, [role='button']")) return;
      if (target.closest("[data-no-global-loading='true'], .pmc-theme-toggle")) return;
      interactionAtRef.current = Date.now();
    };

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;

      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || !isSameAppNavigation(anchor)) return;

      navigationPendingRef.current = true;
      interactionAtRef.current = Date.now();
      queueLoader();
    };

    const handleSubmit = () => {
      interactionAtRef.current = Date.now();
      navigationPendingRef.current = true;
      queueLoader();
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const isUserInitiated = Date.now() - interactionAtRef.current < INTERACTION_WINDOW_MS;
      if (isUserInitiated) {
        activeRequestsRef.current += 1;
        queueLoader();
      }

      try {
        return await originalFetch(...args);
      } finally {
        if (isUserInitiated) {
          finishOneRequest();
        }
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pagehide", hideLoader);

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pagehide", hideLoader);
      clearShowTimer();
      clearMaxTimer();
    };
  }, []);

  useEffect(() => {
    navigationPendingRef.current = false;
    if (activeRequestsRef.current === 0) {
      visibleRef.current = false;
      setVisible(false);
    }
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="pmc-global-loading" role="status" aria-live="polite" aria-label="กำลังโหลด">
      <div className="pmc-global-loading-card">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.28" />
          <path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2z" />
        </svg>
        <span>กำลังโหลด...</span>
      </div>
    </div>
  );
}
