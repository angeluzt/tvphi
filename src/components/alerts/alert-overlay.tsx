"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket-client";
import type { AlertPayload, OverlayAction } from "@/lib/realtime/events";
import { Gift, Heart, Star, Zap } from "lucide-react";

const ICON = {
  donation: Gift,
  follow: Heart,
  subscription: Star,
  redemption: Zap,
} as const;

// Muestra alertas entrantes como notificaciones animadas. Sirve como browser-source
// (página /overlay) y también dentro del compositor del Studio.
export function AlertOverlay({
  channelSlug,
  transparent = false,
}: {
  channelSlug: string;
  transparent?: boolean;
}) {
  const [current, setCurrent] = useState<AlertPayload | null>(null);
  const queue = useRef<AlertPayload[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => socket.emit("join", { channelSlug });
    if (socket.connected) onConnect();
    socket.on("connect", onConnect);

    const pump = () => {
      if (busy.current) return;
      const next = queue.current.shift();
      if (!next) return;
      busy.current = true;
      setCurrent(next);
      const dur = next.durationMs ?? 6000;
      setTimeout(() => {
        setCurrent(null);
        busy.current = false;
        setTimeout(pump, 350);
      }, dur);
    };

    const onAlert = (a: AlertPayload) => {
      queue.current.push(a);
      pump();
    };
    const onOverlayAction = (action: OverlayAction) => {
      if (action.action === "SHOW_MESSAGE") {
        queue.current.push({
          id: action.id,
          kind: "redemption",
          title: String((action.payload as any).user ?? "Alguien"),
          subtitle: String((action.payload as any).userInput ?? ""),
          accent: "#14b8a6",
          durationMs: 6000,
        });
        pump();
      }
    };

    socket.on("alert", onAlert);
    socket.on("overlay:action", onOverlayAction);
    return () => {
      socket.off("connect", onConnect);
      socket.off("alert", onAlert);
      socket.off("overlay:action", onOverlayAction);
    };
  }, [channelSlug]);

  const Icon = current ? ICON[current.kind] : Gift;
  const accent = current?.accent ?? "#14b8a6";

  return (
    <div
      className={
        transparent
          ? "pointer-events-none absolute inset-0"
          : "pointer-events-none absolute inset-0"
      }
    >
      {current && (
        <div
          key={current.id}
          className="animate-alert-in absolute left-1/2 top-8 w-[min(90%,520px)] -translate-x-1/2"
          style={{ ["--alert-duration" as any]: `${current.durationMs ?? 6000}ms` }}
        >
          <div
            className="flex items-center gap-4 rounded-2xl border p-4 shadow-2xl backdrop-blur-md"
            style={{
              borderColor: `${accent}66`,
              background: `linear-gradient(135deg, ${accent}26, rgba(10,10,16,0.85))`,
              boxShadow: `0 10px 50px -10px ${accent}88`,
            }}
          >
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-black"
              style={{ background: accent }}
            >
              <Icon className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-white">{current.title}</p>
              {current.subtitle && (
                <p className="mt-0.5 line-clamp-2 text-sm text-white/80">{current.subtitle}</p>
              )}
            </div>
            {current.amount && (
              <span className="ml-auto shrink-0 text-2xl font-black" style={{ color: accent }}>
                {current.amount}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
