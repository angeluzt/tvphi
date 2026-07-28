"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Maximize2 } from "lucide-react";
import { assetUrl, cachedUrl } from "@/lib/story/store";
import {
  clampFrame, frameH, coverFrame, applyPreset, zoomToPoint,
  type Frame, type Shot, type MotionPreset,
} from "@/lib/story/model";

const PRESETS: { id: MotionPreset; label: string }[] = [
  { id: "fixed", label: "Fijo" },
  { id: "in", label: "Acercar" },
  { id: "out", label: "Alejar" },
  { id: "left", label: "← Izq." },
  { id: "right", label: "Der. →" },
  { id: "up", label: "↑ Subir" },
  { id: "down", label: "↓ Bajar" },
];

// Editor del encuadre de una toma: muestra la imagen completa con dos recuadros
// (inicio y fin). Arrastrando cada uno se decide desde dónde y hacia dónde se
// mueve la cámara — así una misma imagen da varias tomas distintas.
export function FramingEditor({
  shot,
  imageId,
  imgW,
  imgH,
  onChange,
}: {
  shot: Shot;
  imageId: string;
  imgW: number;
  imgH: number;
  onChange: (s: Shot) => void;
}) {
  const [url, setUrl] = useState<string | null>(() => cachedUrl(imageId));
  const [edit, setEdit] = useState<"from" | "to">("to");
  const [aiming, setAiming] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { mode: "move" | "size"; sx: number; sy: number; f: Frame; rw: number; rh: number }>(null);

  useEffect(() => {
    let alive = true;
    if (!url) assetUrl(imageId).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [imageId, url]);

  const setFrame = (which: "from" | "to", f: Frame) =>
    onChange({ ...shot, [which]: clampFrame(f, imgW, imgH) });

  function begin(which: "from" | "to", mode: "move" | "size", e: React.PointerEvent) {
    if (!boxRef.current) return;
    e.preventDefault(); e.stopPropagation();
    setEdit(which);
    const r = boxRef.current.getBoundingClientRect();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, f: shot[which], rw: r.width, rh: r.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(which: "from" | "to", e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.rw;
    const dy = (e.clientY - d.sy) / d.rh;
    if (d.mode === "move") setFrame(which, { ...d.f, cx: d.f.cx + dx, cy: d.f.cy + dy });
    else setFrame(which, { ...d.f, w: d.f.w + dx * 2 });
  }
  function end(e: React.PointerEvent) {
    drag.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  // Clic sobre la imagen en modo puntería: la toma termina centrada ahí.
  function aim(e: React.MouseEvent) {
    if (!aiming || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    onChange(zoomToPoint(shot, px, py, imgW, imgH));
    setAiming(false);
  }

  const aspect = imgW && imgH ? imgW / imgH : 16 / 9;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setEdit("from")}
          className={`rounded-lg border px-2 py-1 text-xs ${edit === "from" ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:bg-surface-2"}`}
        >
          Encuadre inicial
        </button>
        <button
          onClick={() => setEdit("to")}
          className={`rounded-lg border px-2 py-1 text-xs ${edit === "to" ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2"}`}
        >
          Encuadre final
        </button>
        <button
          onClick={() => setAiming((v) => !v)}
          className={`ml-auto flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${aiming ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2"}`}
          title="Elegir hacia qué punto se dirige el movimiento"
        >
          <Crosshair className="h-3 w-3" /> {aiming ? "Haz clic en la imagen…" : "Apuntar a un punto"}
        </button>
        <button
          onClick={() => onChange({ ...shot, from: coverFrame(imgW, imgH), to: coverFrame(imgW, imgH) })}
          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2"
          title="Restablecer los dos encuadres a la imagen completa"
        >
          <Maximize2 className="h-3 w-3" /> Completo
        </button>
      </div>

      <div
        ref={boxRef}
        onClick={aim}
        className={`relative w-full overflow-hidden rounded-xl border border-border bg-black ${aiming ? "cursor-crosshair" : ""}`}
        style={{ aspectRatio: String(aspect) }}
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-fill opacity-70" draggable={false} />
        )}
        <FrameBox
          frame={shot.from} imgW={imgW} imgH={imgH} label="1" color="brand" active={edit === "from"}
          onDown={(m, e) => begin("from", m, e)} onMove={(e) => move("from", e)} onUp={end}
        />
        <FrameBox
          frame={shot.to} imgW={imgW} imgH={imgH} label="2" color="accent" active={edit === "to"}
          onDown={(m, e) => begin("to", m, e)} onMove={(e) => move("to", e)} onUp={end}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange(applyPreset(shot, p.id, imgW, imgH))}
            className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2"
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">
        El recuadro <span className="text-brand">1</span> es dónde empieza la toma y el{" "}
        <span className="text-accent">2</span> dónde termina. Arrástralos para moverlos y usa la
        esquina para cambiar el tamaño (el zoom sale de la diferencia entre los dos).
      </p>
    </div>
  );
}

function FrameBox({
  frame, imgW, imgH, label, color, active, onDown, onMove, onUp,
}: {
  frame: Frame;
  imgW: number;
  imgH: number;
  label: string;
  color: "brand" | "accent";
  active: boolean;
  onDown: (mode: "move" | "size", e: React.PointerEvent) => void;
  onMove: (e: React.PointerEvent) => void;
  onUp: (e: React.PointerEvent) => void;
}) {
  const h = frameH(frame.w, imgW, imgH);
  const border = color === "brand" ? "border-brand" : "border-accent";
  const bg = color === "brand" ? "bg-brand" : "bg-accent";
  return (
    <div
      onPointerDown={(e) => onDown("move", e)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className={`absolute cursor-move rounded border-2 ${border} ${active ? "opacity-100" : "opacity-45"}`}
      style={{
        left: `${(frame.cx - frame.w / 2) * 100}%`,
        top: `${(frame.cy - h / 2) * 100}%`,
        width: `${frame.w * 100}%`,
        height: `${h * 100}%`,
        boxShadow: active ? "0 0 0 9999px rgba(0,0,0,.35)" : undefined,
      }}
    >
      <span className={`absolute left-1 top-1 rounded px-1 text-[10px] font-bold text-black ${bg}`}>{label}</span>
      <div
        onPointerDown={(e) => onDown("size", e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className={`absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-black/60 ${bg}`}
      />
    </div>
  );
}
