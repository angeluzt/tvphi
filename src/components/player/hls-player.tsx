"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { cn } from "@/lib/utils";

// Reproductor HLS para espectadores. Usa hls.js donde no hay soporte nativo (Chrome/Firefox)
// y el reproductor nativo en Safari.
export function HlsPlayer({
  src,
  className,
  poster,
}: {
  src: string;
  className?: string;
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setError(false);

    let hls: Hls | null = null;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setError(true);
      });
    } else {
      setError(true);
    }

    return () => {
      hls?.destroy();
    };
  }, [src]);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-black", className)}>
      <video
        ref={videoRef}
        poster={poster}
        controls
        playsInline
        autoPlay
        muted
        className="h-full w-full"
      />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 text-center text-sm text-muted">
          <div>
            <p className="font-medium text-fg">No se pudo cargar el video</p>
            <p className="mt-1">El canal podría estar offline.</p>
          </div>
        </div>
      )}
    </div>
  );
}
