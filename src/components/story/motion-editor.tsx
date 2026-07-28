"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Maximize2, Move, Wand2 } from "lucide-react";
import { assetUrl, cachedUrl } from "@/lib/story/store";
import { Slider } from "./slider";
import {
  clampFrame, frameH, coverFrame, maxFrameW, presetMaxW, resolveFrames, distanceRange,
  type Frame, type Shot, type MotionKind,
} from "@/lib/story/model";

const KINDS: { id: MotionKind; label: string }[] = [
  { id: "fixed", label: "Fijo" },
  { id: "in", label: "Acercar" },
  { id: "out", label: "Alejar" },
  { id: "left", label: "← Izquierda" },
  { id: "right", label: "Derecha →" },
  { id: "up", label: "↑ Subir" },
  { id: "down", label: "↓ Bajar" },
];

// Editor del movimiento de una toma. Dos modos excluyentes:
//   · Predefinido: se elige dirección y se ajusta con barras la posición, el
//     tamaño y la separación entre los dos puntos (que se mueven juntos).
//   · Libre: se coloca el punto 1 y el punto 2 por separado, cada uno con su
//     posición y su tamaño, para ir de cualquier sitio a cualquier otro.
// Todo se puede hacer con barras (cómodo en móvil) o arrastrando en la imagen.
export function MotionEditor({
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
  const [point, setPoint] = useState<"from" | "to">("to");
  const [aiming, setAiming] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { mode: "move" | "size"; which: "from" | "to" | "both"; sx: number; sy: number; f: Frame; cx: number; cy: number; w: number; rw: number; rh: number }>(null);

  useEffect(() => {
    let alive = true;
    if (!url) assetUrl(imageId).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [imageId, url]);

  const preset = shot.preset;
  const frames = resolveFrames(shot, imgW, imgH);
  const isPreset = shot.motionMode === "preset";
  const maxW = maxFrameW(imgW, imgH);
  // En predefinido el tamaño se limita para que quepa el recorrido.
  const presetW = presetMaxW(preset.kind, preset.distance, imgW, imgH);
  const range = distanceRange(preset.kind);

  // Al pasar a libre se copian los encuadres actuales para que nada dé un salto.
  function setMode(mode: "preset" | "free") {
    if (mode === shot.motionMode) return;
    if (mode === "free") onChange({ ...shot, motionMode: "free", from: frames.from, to: frames.to });
    else onChange({ ...shot, motionMode: "preset" });
  }
  function setPreset(patch: Partial<typeof preset>) {
    onChange({ ...shot, motionMode: "preset", preset: { ...preset, ...patch } });
  }
  function setKind(kind: MotionKind) {
    const r = distanceRange(kind);
    const d = kind === "fixed" ? 0 : Math.max(r.min, Math.min(r.max, preset.distance || 0.28));
    setPreset({ kind, distance: d });
  }
  function setFrame(which: "from" | "to", f: Frame) {
    onChange({ ...shot, motionMode: "free", [which]: clampFrame(f, imgW, imgH) });
  }

  // ---- arrastre sobre la imagen ----
  function begin(which: "from" | "to" | "both", mode: "move" | "size", e: React.PointerEvent) {
    if (!boxRef.current) return;
    e.preventDefault(); e.stopPropagation();
    if (which !== "both") setPoint(which);
    const r = boxRef.current.getBoundingClientRect();
    const pw = Math.min(preset.w, presetW);
    const f = which === "both" ? { cx: preset.cx, cy: preset.cy, w: pw } : shot[which];
    drag.current = { mode, which, sx: e.clientX, sy: e.clientY, f, cx: preset.cx, cy: preset.cy, w: pw, rw: r.width, rh: r.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.rw;
    const dy = (e.clientY - d.sy) / d.rh;
    if (d.which === "both") {
      // En modo predefinido se arrastran los dos puntos a la vez.
      if (d.mode === "move") setPreset({ cx: clamp01(d.cx + dx), cy: clamp01(d.cy + dy) });
      else setPreset({ w: Math.max(0.05, Math.min(presetW, d.w + dx * 2)) });
    } else if (d.mode === "move") {
      setFrame(d.which, { ...d.f, cx: d.f.cx + dx, cy: d.f.cy + dy });
    } else {
      setFrame(d.which, { ...d.f, w: d.f.w + dx * 2 });
    }
  }
  function end(e: React.PointerEvent) {
    drag.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  // Clic en la imagen con la puntería activa: fija hacia dónde va el movimiento.
  function aim(e: React.MouseEvent) {
    if (!aiming || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const px = clamp01((e.clientX - r.left) / r.width);
    const py = clamp01((e.clientY - r.top) / r.height);
    if (isPreset) setPreset({ cx: px, cy: py });
    else setFrame(point, { ...shot[point], cx: px, cy: py });
    setAiming(false);
  }

  const aspect = imgW && imgH ? imgW / imgH : 16 / 9;
  const activeFrame = isPreset ? null : shot[point];

  return (
    <div className="space-y-3">
      {/* Modo */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setMode("preset")}
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${isPreset ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:bg-surface-2"}`}
        >
          <Wand2 className="h-3 w-3" /> Movimiento predefinido
        </button>
        <button
          onClick={() => setMode("free")}
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${!isPreset ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2"}`}
        >
          <Move className="h-3 w-3" /> Libre (punto 1 → punto 2)
        </button>
      </div>

      {/* Imagen con los dos recuadros */}
      <div
        ref={boxRef}
        onClick={aim}
        className={`relative mx-auto w-full overflow-hidden rounded-xl border border-border bg-black ${aiming ? "cursor-crosshair" : ""}`}
        // Se acota la altura para que no quede debajo de la previsualización fija.
        style={{ aspectRatio: String(aspect), maxWidth: `calc(46vh * ${aspect})` }}
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-fill opacity-70" draggable={false} />
        )}
        <FrameBox
          frame={frames.from} imgW={imgW} imgH={imgH} label="1" color="brand"
          active={isPreset || point === "from"}
          onDown={(m, e) => begin(isPreset ? "both" : "from", m, e)} onMove={move} onUp={end}
        />
        <FrameBox
          frame={frames.to} imgW={imgW} imgH={imgH} label="2" color="accent"
          active={isPreset || point === "to"}
          onDown={(m, e) => begin(isPreset ? "both" : "to", m, e)} onMove={move} onUp={end}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setAiming((v) => !v)}
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${aiming ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2"}`}
          title="Elegir en la imagen dónde se centra el movimiento"
        >
          <Crosshair className="h-3 w-3" /> {aiming ? "Haz clic en la imagen…" : "Apuntar a un punto"}
        </button>
        <button
          onClick={() => {
            const cover = coverFrame(imgW, imgH);
            if (isPreset) setPreset({ cx: 0.5, cy: 0.5, w: cover.w });
            else onChange({ ...shot, from: cover, to: cover });
          }}
          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2"
          title="Volver a la imagen completa"
        >
          <Maximize2 className="h-3 w-3" /> Imagen completa
        </button>
      </div>

      {isPreset ? (
        <div className="space-y-2 rounded-xl border border-brand/40 bg-brand/5 p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={`rounded-lg border px-2 py-1 text-xs ${preset.kind === k.id ? "border-brand bg-brand/20 text-brand" : "border-border text-muted hover:bg-surface-2"}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <Slider label="Posición X" value={preset.cx} min={0} max={1} step={0.005}
            onChange={(v) => setPreset({ cx: v })} format={pct} />
          <Slider label="Posición Y" value={preset.cy} min={0} max={1} step={0.005}
            onChange={(v) => setPreset({ cy: v })} format={pct} />
          <Slider label="Tamaño (zoom)" value={Math.min(preset.w, presetW)} min={0.1} max={presetW} step={0.005}
            onChange={(v) => setPreset({ w: v })} format={pct}
            hint={presetW < maxW - 0.01
              ? "Más pequeño = más acercado (limitado para que quepa el recorrido)"
              : "Más pequeño = más acercado"} />
          {preset.kind !== "fixed" && (
            <Slider
              label={preset.kind === "in" || preset.kind === "out" ? "Cuánto acerca/aleja" : "Separación entre 1 y 2"}
              value={preset.distance} min={range.min} max={range.max} step={0.005}
              onChange={(v) => setPreset({ distance: v })} format={pct}
              hint="En negativo el movimiento va al revés"
            />
          )}
          <p className="text-[11px] text-muted">
            Los dos recuadros se mueven y se redimensionan juntos; la separación decide
            cuánto recorre y hacia dónde.
          </p>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-accent/40 bg-accent/5 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Editando:</span>
            <button
              onClick={() => setPoint("from")}
              className={`rounded-lg border px-2 py-1 text-xs ${point === "from" ? "border-brand bg-brand/20 text-brand" : "border-border text-muted hover:bg-surface-2"}`}
            >
              Punto 1 (inicio)
            </button>
            <button
              onClick={() => setPoint("to")}
              className={`rounded-lg border px-2 py-1 text-xs ${point === "to" ? "border-accent bg-accent/20 text-accent" : "border-border text-muted hover:bg-surface-2"}`}
            >
              Punto 2 (final)
            </button>
          </div>
          {activeFrame && (
            <>
              <Slider label="Posición X" value={activeFrame.cx} min={0} max={1} step={0.005}
                onChange={(v) => setFrame(point, { ...activeFrame, cx: v })} format={pct} />
              <Slider label="Posición Y" value={activeFrame.cy} min={0} max={1} step={0.005}
                onChange={(v) => setFrame(point, { ...activeFrame, cy: v })} format={pct} />
              <Slider label="Tamaño" value={activeFrame.w} min={0.1} max={maxW} step={0.005}
                onChange={(v) => setFrame(point, { ...activeFrame, w: v })} format={pct}
                hint="Más pequeño = más acercado" />
            </>
          )}
          <button
            onClick={() => onChange({ ...shot, from: shot.to, to: shot.from })}
            className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2"
          >
            Intercambiar 1 ⇄ 2
          </button>
          <p className="text-[11px] text-muted">
            Coloca el punto <span className="text-brand">1</span> donde empieza y el{" "}
            <span className="text-accent">2</span> donde termina, cada uno con su tamaño:
            la toma va de uno a otro en cualquier dirección, acercándose o alejándose.
          </p>
        </div>
      )}
    </div>
  );
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

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
      }}
    >
      <span className={`absolute left-1 top-1 rounded px-1 text-[10px] font-bold text-black ${bg}`}>{label}</span>
      <div
        onPointerDown={(e) => onDown("size", e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className={`absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-se-resize rounded-sm border border-black/60 ${bg}`}
      />
    </div>
  );
}
