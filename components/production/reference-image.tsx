"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Image } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getReferenceImage } from "@/lib/production-data";
import "./reference-image.css";

export function useBlobUrl(blob: Blob | undefined) {
  const [media, setMedia] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setMedia({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return media?.blob === blob ? media?.url : undefined;
}

export function ReferenceImage({ id, alt, fallback, url }: {
  id?: string;
  alt: string;
  fallback?: ReactNode;
  url?: string;
}) {
  const image = useLiveQuery(() => id ? getReferenceImage(id).catch(() => undefined) : undefined, [id]);
  const storedUrl = useBlobUrl(image?.blob);
  const src = url ?? storedUrl;

  return (
    <div className="reference-photo">
      {src ? <img src={src} alt={alt} /> : <span aria-hidden="true">{fallback ?? <Image size={23} />}</span>}
    </div>
  );
}
