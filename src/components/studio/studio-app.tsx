"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compositor } from "@/lib/studio/compositor";
import { createLayer, createScene } from "@/lib/studio/factory";
import { publishWhip, type WhipSession } from "@/lib/media/whip-client";
import { getSocket } from "@/lib/socket-client";
import { TransitionKinds, type Layer, type LayerType, type Scene, type TransitionKind } from "@/lib/scene";
import { cn } from "@/lib/utils";
import {
  Video, MonitorUp, Type, Image as ImageIcon, Square, Bell, Plus, Trash2,
  Eye, EyeOff, Save, Radio, CircleStop, Copy, Layers as LayersIcon, TestTube,
} from "lucide-react";

const LAYER_TYPES: { type: LayerType; label: string; icon: any }[] = [
  { type: "webcam", label: "Cámara", icon: Video },
  { type: "screen", label: "Pantalla", icon: MonitorUp },
  { type: "text", label: "Texto", icon: Type },
  { type: "image", label: "Imagen", icon: ImageIcon },
  { type: "background", label: "Fondo", icon: Square },
  { type: "alerts", label: "Alertas", icon: Bell },
];

interface IngestInfo {
  whipUrl: string;
  rtmpUrl: string;
  streamKey: string;
  provider: string;
}

export function StudioApp({
  initialScenes,
  channelSlug,
  overlayUrl,
}: {
  initialScenes: Scene[];
  channelSlug: string;
  overlayUrl: string;
}) {
  const [scenes, setScenes] = useState<Scene[]>(
    initialScenes.length ? initialScenes : [createScene("Escena 1")],
  );
  const [activeId, setActiveId] = useState(scenes[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transition, setTransition] = useState<TransitionKind>("fade");
  const [live, setLive] = useState(false);
  const [ingest, setIngest] = useState<IngestInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const compRef = useRef<Compositor | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const whipRef = useRef<WhipSession | null>(null);

  const activeScene = useMemo(() => scenes.find((s) => s.id === activeId) ?? scenes[0], [scenes, activeId]);
  const selected = activeScene.layers.find((l) => l.id === selectedId) ?? null;

  // Inicializa el compositor.
  useEffect(() => {
    const comp = new Compositor();
    compRef.current = comp;
    comp.setScenes(scenes);
    comp.start();
    if (previewRef.current) {
      comp.canvas.className = "h-full w-full object-contain";
      previewRef.current.appendChild(comp.canvas);
    }
    // Alertas entrantes -> se dibujan en el stream y se ven en el preview.
    const socket = getSocket();
    const join = () => socket.emit("join", { channelSlug });
    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("alert", (a) =>
      comp.pushAlert({ title: a.title, subtitle: a.subtitle, accent: a.accent, durationMs: a.durationMs }),
    );
    return () => {
      socket.off("connect", join);
      socket.off("alert");
      comp.destroy();
      compRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza escenas con el compositor en cada cambio.
  useEffect(() => {
    compRef.current?.setScenes(scenes);
  }, [scenes]);

  function switchScene(id: string) {
    compRef.current?.switchScene(id, transition, 500);
    setActiveId(id);
    setSelectedId(null);
  }

  function mutateScene(sceneId: string, fn: (s: Scene) => Scene) {
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? fn(s) : s)));
  }

  function addLayer(type: LayerType) {
    const layer = createLayer(type);
    mutateScene(activeScene.id, (s) => ({ ...s, layers: [...s.layers, layer] }));
    setSelectedId(layer.id);
    if (type === "webcam") compRef.current?.enableWebcam().catch(() => setStatus("No se pudo acceder a la cámara"));
    if (type === "screen") compRef.current?.enableScreen().catch(() => setStatus("Compartir pantalla cancelado"));
  }

  function updateLayer(layerId: string, patch: Partial<Layer> | ((l: Layer) => Layer)) {
    mutateScene(activeScene.id, (s) => ({
      ...s,
      layers: s.layers.map((l) =>
        l.id === layerId ? (typeof patch === "function" ? patch(l) : ({ ...l, ...patch } as Layer)) : l,
      ),
    }));
  }
  function removeLayer(layerId: string) {
    mutateScene(activeScene.id, (s) => ({ ...s, layers: s.layers.filter((l) => l.id !== layerId) }));
    if (selectedId === layerId) setSelectedId(null);
  }

  function addScene() {
    const s = createScene(`Escena ${scenes.length + 1}`);
    setScenes((prev) => [...prev, s]);
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    const res = await fetch("/api/channel/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes }),
    });
    setSaving(false);
    setStatus(res.ok ? "Escenas guardadas ✓" : "Error al guardar");
    setTimeout(() => setStatus(null), 2500);
  }

  async function goLive() {
    setStatus("Iniciando…");
    const res = await fetch("/api/stream/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "No se pudo iniciar");
      return;
    }
    setIngest({ whipUrl: data.whipUrl, rtmpUrl: data.rtmpUrl, streamKey: data.streamKey, provider: data.provider });
    // Publica el stream del compositor por WHIP (si el proveedor real lo soporta).
    // En modo demo (mock) no hay ingest real: solo mostramos el preview local.
    try {
      if (data.whipUrl && data.provider !== "mock") {
        const stream = compRef.current!.captureStream();
        whipRef.current = await publishWhip(data.whipUrl, stream);
      } else {
        // Fuerza la creación del stream para activar el audio/preview.
        compRef.current!.captureStream();
      }
      setLive(true);
      setStatus(data.provider === "mock" ? "En vivo (modo demo)" : "¡En vivo!");
    } catch (err: any) {
      setLive(true); // el canal ya está marcado en vivo; OBS puede publicar por RTMP
      setStatus(`En vivo. WHIP no disponible (${err?.message ?? "usa OBS"})`);
    }
  }

  async function stopLive() {
    await whipRef.current?.stop().catch(() => {});
    whipRef.current = null;
    await fetch("/api/stream/stop", { method: "POST" });
    setLive(false);
    setStatus("Emisión finalizada");
  }

  function testAlert() {
    getSocket().emit("overlay:test", { kind: "donation" });
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
      {/* Escenas */}
      <aside className="card flex flex-col p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Escenas</span>
          <button onClick={addScene} className="rounded-lg p-1 text-brand hover:bg-surface-2" title="Nueva escena">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {scenes.map((s) => (
            <button
              key={s.id}
              onClick={() => switchScene(s.id)}
              className={cn(
                "w-full rounded-xl border p-2 text-left text-sm transition",
                s.id === activeId ? "border-brand bg-brand/10 text-fg shadow-glow" : "border-border bg-surface-2 hover:bg-border/40",
              )}
            >
              <div className="flex items-center gap-2">
                <LayersIcon className="h-3.5 w-3.5 text-muted" />
                <span className="truncate">{s.name}</span>
                {s.id === activeId && live && <span className="ml-auto h-2 w-2 rounded-full bg-live animate-pulse-live" />}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-3">
          <span className="label">Transición</span>
          <div className="mt-1 flex gap-1">
            {TransitionKinds.map((k) => (
              <button
                key={k}
                onClick={() => setTransition(k)}
                className={cn("flex-1 rounded-lg px-2 py-1 text-xs capitalize", transition === k ? "bg-brand text-white" : "bg-surface-2 text-muted")}
              >
                {k === "cut" ? "Corte" : k === "fade" ? "Fundido" : "Deslizar"}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Preview + controles */}
      <section className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black" ref={previewRef}>
          <div className="pointer-events-none absolute left-3 top-3 z-10">
            {live ? (
              <span className="chip bg-live/15 text-live">
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" /> EN VIVO
              </span>
            ) : (
              <span className="chip bg-surface-2 text-muted">PREVIEW</span>
            )}
          </div>
        </div>

        {/* Barra de acciones */}
        <div className="card flex flex-wrap items-center gap-2 p-3">
          {!live ? (
            <button onClick={goLive} className="btn-brand">
              <Radio className="h-4 w-4" /> Transmitir
            </button>
          ) : (
            <button onClick={stopLive} className="btn-danger">
              <CircleStop className="h-4 w-4" /> Detener
            </button>
          )}
          <button onClick={save} className="btn-ghost" disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={testAlert} className="btn-ghost" title="Probar alerta">
            <TestTube className="h-4 w-4" /> Probar alerta
          </button>
          <a href={`/${channelSlug}`} target="_blank" className="btn-ghost">
            Ver canal
          </a>
          {status && <span className="ml-auto text-sm text-muted">{status}</span>}
        </div>

        {/* Fuentes rápidas */}
        <div className="card p-3">
          <span className="label">Añadir fuente / capa</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {LAYER_TYPES.map((t) => (
              <button key={t.type} onClick={() => addLayer(t.type)} className="btn-ghost">
                <t.icon className="h-4 w-4 text-accent" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ingest / OBS */}
        {ingest && (
          <div className="card space-y-2 p-3 text-sm">
            <span className="label">¿Prefieres OBS? Usa estos datos (RTMP)</span>
            <CopyRow label="Servidor RTMP" value={ingest.rtmpUrl} />
            <CopyRow label="Clave de stream" value={ingest.streamKey} secret />
            <CopyRow label="Overlay (browser source)" value={overlayUrl} />
          </div>
        )}
      </section>

      {/* Capas + propiedades */}
      <aside className="card flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden p-3">
        <span className="label">Capas · {activeScene.name}</span>
        <div className="mt-2 space-y-1 overflow-y-auto">
          {[...activeScene.layers]
            .sort((a, b) => (b.transform.z ?? 0) - (a.transform.z ?? 0))
            .map((l) => (
              <div
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm",
                  selectedId === l.id ? "border-brand bg-brand/10" : "border-transparent hover:bg-surface-2",
                )}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible } as any); }}
                  className="text-muted hover:text-fg"
                >
                  {l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <span className="flex-1 truncate">{l.name}</span>
                <button onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }} className="text-muted hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>

        {selected && (
          <div className="mt-3 border-t border-border pt-3">
            <LayerEditor layer={selected} onChange={(patch) => updateLayer(selected.id, patch)} />
          </div>
        )}
      </aside>
    </div>
  );
}

function LayerEditor({ layer, onChange }: { layer: Layer; onChange: (patch: (l: Layer) => Layer) => void }) {
  const t = layer.transform;
  const setT = (k: keyof typeof t, v: number) =>
    onChange((l) => ({ ...l, transform: { ...l.transform, [k]: v } }) as Layer);
  const setProp = (k: string, v: any) =>
    onChange((l) => ({ ...l, props: { ...(l as any).props, [k]: v } }) as Layer);

  return (
    <div className="space-y-3 text-sm">
      <span className="label">Propiedades</span>

      {layer.type === "text" && (
        <>
          <textarea
            className="input"
            rows={2}
            value={(layer as any).props.text}
            onChange={(e) => setProp("text", e.target.value)}
          />
          <div className="flex items-center gap-2">
            <input type="color" value={(layer as any).props.color} onChange={(e) => setProp("color", e.target.value)} className="h-8 w-10 rounded" />
            <input type="number" className="input" value={(layer as any).props.fontSize} onChange={(e) => setProp("fontSize", Number(e.target.value))} />
          </div>
        </>
      )}
      {layer.type === "image" && (
        <input className="input" placeholder="URL de la imagen" value={(layer as any).props.src} onChange={(e) => setProp("src", e.target.value)} />
      )}
      {layer.type === "background" && (
        <div className="flex items-center gap-2">
          <input type="color" value={(layer as any).props.color} onChange={(e) => setProp("color", e.target.value)} className="h-8 w-10 rounded" />
          <input type="color" value={(layer as any).props.gradientTo ?? "#000000"} onChange={(e) => setProp("gradientTo", e.target.value)} className="h-8 w-10 rounded" />
          <span className="text-xs text-muted">color · degradado</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k} className="space-y-1">
            <span className="text-xs uppercase text-muted">{k}</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={t[k]} onChange={(e) => setT(k, Number(e.target.value))}
              className="w-full"
            />
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-xs uppercase text-muted">Opacidad</span>
        <input type="range" min={0} max={1} step={0.05} value={t.opacity} onChange={(e) => setT("opacity", Number(e.target.value))} className="w-full" />
      </label>
    </div>
  );
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-0.5 flex items-center gap-2">
        <input
          readOnly
          value={value}
          type={secret ? "password" : "text"}
          className="input font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="btn-ghost shrink-0"
        >
          <Copy className="h-3.5 w-3.5" /> {copied ? "✓" : ""}
        </button>
      </div>
    </div>
  );
}
