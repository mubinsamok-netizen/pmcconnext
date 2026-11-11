"use client";

import { FileText } from "lucide-react";
import { useState } from "react";

type Props = { sources: string[]; name: string };

export default function ProjectDetailsCover({ sources, name }: Props) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const src = sources[sourceIndex];
  if (!src) return <div role={sources.length ? "status" : undefined} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
    <FileText size={64} />
    <span className="text-sm">{sources.length ? "ไม่สามารถโหลดรูปโครงการได้" : "ยังไม่มีรูปโครงการ"}</span>
  </div>;

  return <>
    {!loaded && <div role="status" aria-label="กำลังโหลดรูปโครงการ" className="absolute inset-0 motion-safe:animate-pulse bg-gray-200" />}
    {/* eslint-disable-next-line @next/next/no-img-element -- Same-origin Drive thumbnails and legacy external covers keep their existing browser authentication. */}
    <img key={src} src={src} alt={name} loading="eager" fetchPriority="high" decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
      onLoad={() => setLoaded(true)}
      onError={() => { setLoaded(false); setSourceIndex((current) => sources[current] === src ? current + 1 : current); }} />
  </>;
}
