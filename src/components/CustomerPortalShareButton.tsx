"use client";

import { useState } from "react";
import { Copy, ExternalLink, Loader2, Share2 } from "lucide-react";

export default function CustomerPortalShareButton({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function createLink() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(projectId)}/customer-portal-share`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "ไม่สามารถสร้างลิงก์ลูกค้าได้");
      setUrl(result.url);
      await navigator.clipboard.writeText(result.url);
      setMessage("สร้างและคัดลอกลิงก์ลูกค้าแล้ว");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถสร้างลิงก์ลูกค้าได้");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("คัดลอกลิงก์แล้ว");
    } catch {
      window.prompt("คัดลอกลิงก์", url);
    }
  }

  return (
    <div className="rounded-2xl border border-orange-100 bg-orange-50 p-3">
      <button
        type="button"
        onClick={createLink}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
        สร้างลิงก์ลูกค้า
      </button>

      {url ? (
        <div className="mt-3 flex gap-2">
          <input
            value={url}
            readOnly
            className="min-w-0 flex-1 rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-gray-500 outline-none"
          />
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-white text-orange-700 hover:bg-orange-100"
            title="คัดลอกลิงก์"
          >
            <Copy size={15} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-white text-orange-700 hover:bg-orange-100"
            title="เปิดลิงก์"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs font-bold text-orange-800">{message}</p> : null}
    </div>
  );
}
