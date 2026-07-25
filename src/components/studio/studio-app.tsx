"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compositor } from "@/lib/studio/compositor";
import { createLayer, createScene } from "@/lib/studio/factory";
import { publishWhip, type WhipSession } from "@/lib/media/whip-client";
import { getSocket } from "@/lib/socket-client";
import { TransitionKinds, type Layer, type LayerType, type Scene, type TransitionKind, type Transform } from "@/lib/scene";
import { cn } from "@/lib/utils";
import {
  Video, MonitorUp, Type, Image as ImageIcon, Square, Bell, Plus, Trash2,
  Eye, EyeOff, Save, Radio, CircleStop, Copy, Layers as LayersIcon, TestTube,
  Pencil, Upload, RefreshCw, ChevronUp, ChevronDown,
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
type Camera = { deviceId: string; label: string };

export function StudioApp({
  initialScenes,
  channelSlug,
  overlayUrl,
  initialLive = false,
}: {
  initialScenes: Scene[];
  channelSlug: string;
  overlayUrl: string;
  initialLive?: boolean;
}) {
  const [scenes, setScenes] = useState<Scene[]>(
    initialScenes.length ? initialScenes : [createScene("Escena 1")],
  );
  const [activeId, setActiveId] = useState(scenes[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transition, setTransitionState] = useState<TransitionKind>("fade");
  const [live, setLive] = useState(initialLive);
  const [ingest, setIngest] = useState<IngestInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

  const compRef = useRef<Compositor | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const whipRef = useRef<WhipSession | null>(null);
  const skipAutosave = useRef(true);

  const activeScene = useMemo(() => scenes.find((s) => s.id === activeId) ?? scenes[0], [scenes, activeId]);
  const selected = activeScene.layers.find((l) => l.id === selectedId) ?? null;

  async function refreshCameras() {
    const list = await compRef.current?.listCameras();
    if (list) setCameras(list);
  }

  // Recuerda el tipo de transición elegido (por canal, en el navegador).
  useEffect(() => {
    const saved = localStorage.getItem(`tvphi:transition:${channelSlug}`);
    if (saved && (TransitionKinds as readonly string[]).includes(saved)) {
      setTransitionState(saved as TransitionKind);
    }
  }, [channelSlug]);
  function setTransition(k: TransitionKind) {
    setTransitionState(k);
    try {
      localStorage.setItem(`tvphi:transition:${channelSlug}`, k);
    } catch {}
  }

  // Reordena una capa en el eje Z (intercambia con la vecina).
  function reorderLayer(layerId: string, dir: "up" | "down") {
    mutateScene(activeScene.id, (s) => {
      const asc = [...s.layers].sort((a, b) => (a.transform.z ?? 0) - (b.transform.z ?? 0));
      const idx = asc.findIndex((l) => l.id === layerId);
      const swap = dir === "up" ? idx + 1 : idx - 1; // "up" = más al frente (mayor z)
      if (swap < 0 || swap >= asc.length) return s;
      const a = asc[idx];
      const b = asc[swap];
      const az = a.transform.z ?? 0;
      const bz = b.transform.z ?? 0;
      return {
        ...s,
        layers: s.layers.map((l) =>
          l.id === a.id
            ? ({ ...l, transform: { ...l.transform, z: bz } } as Layer)
            : l.id === b.id
              ? ({ ...l, transform: { ...l.transform, z: az } } as Layer)
              : l,
        ),
      };
    });
  }

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
    refreshCameras();
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

  // Sincroniza escenas + ciclo de vida de cámara/pantalla en cada cambio.
  useEffect(() => {
    const comp = compRef.current;
    if (!comp) return;
    comp.setScenes(scenes);

    // Cámara: encender si alguna escena visible la usa; apagar si ninguna.
    const allLayers = scenes.flatMap((s) => s.layers);
    const camLayer = allLayers.find((l) => l.type === "webcam" && l.visible) as any;
    if (camLayer) {
      const desired: string | undefined = camLayer.props?.deviceId || undefined;
      const cur = comp.getWebcamDeviceId();
      if (!comp.hasWebcam() || (desired && desired !== cur)) {
        comp.enableWebcam(desired).then(refreshCameras).catch(() => setStatus("No se pudo acceder a la cámara"));
      }
    } else if (comp.hasWebcam()) {
      comp.disableWebcam();
    }

    // Pantalla: solo se apaga sola; encender requiere gesto del usuario (botón).
    const usesScreen = allLayers.some((l) => l.type === "screen" && l.visible);
    if (!usesScreen && comp.hasScreen()) comp.disableScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  // Autoguardado (debounce) — persiste escenas/capas en la BD.
  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    const t = setTimeout(() => void save(true), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // La capa de alertas es única por escena.
    if (type === "alerts" && activeScene.layers.some((l) => l.type === "alerts")) {
      setSelectedId(activeScene.layers.find((l) => l.type === "alerts")!.id);
      setStatus("Ya existe una zona de alertas en esta escena");
      setTimeout(() => setStatus(null), 2500);
      return;
    }
    const layer = createLayer(type);
    mutateScene(activeScene.id, (s) => ({ ...s, layers: [...s.layers, layer] }));
    setSelectedId(layer.id);
    // Cámara la enciende el efecto de arriba. Pantalla necesita gesto: aquí.
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

  function selectCamera(layerId: string, deviceId: string) {
    updateLayer(layerId, (l) => ({ ...l, props: { ...(l as any).props, deviceId: deviceId || undefined } }) as Layer);
    compRef.current?.enableWebcam(deviceId || undefined).then(refreshCameras).catch(() => setStatus("No se pudo cambiar de cámara"));
  }
  function reconnectScreen() {
    compRef.current?.enableScreen().catch(() => setStatus("Compartir pantalla cancelado"));
  }

  function addScene() {
    const s = createScene(`Escena ${scenes.length + 1}`);
    setScenes((prev) => [...prev, s]);
  }
  function renameScene(id: string, name: string) {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }
  function deleteScene(id: string) {
    if (scenes.length <= 1) return;
    const remaining = scenes.filter((s) => s.id !== id);
    setScenes(remaining);
    if (activeId === id) {
      const next = remaining[0];
      setActiveId(next.id);
      compRef.current?.switchScene(next.id, "cut", 0);
      setSelectedId(null);
    }
  }

  async function save(silent = false) {
    if (!silent) setSaving(true);
    const res = await fetch("/api/channel/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes }),
    });
    if (!silent) setSaving(false);
    setStatus(res.ok ? "Guardado ✓" : "Error al guardar");
    setTimeout(() => setStatus(null), 2000);
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
    try {
      if (data.whipUrl && data.provider !== "mock") {
        const stream = compRef.current!.captureStream();
        whipRef.current = await publishWhip(data.whipUrl, stream);
      } else {
        compRef.current!.captureStream();
      }
      setLive(true);
      setStatus(data.provider === "mock" ? "En vivo (demo: los espectadores ven un video de muestra)" : "¡En vivo!");
    } catch (err: any) {
      setLive(true);
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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[230px_minmax(0,1fr)_300px]">
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
            <div
              key={s.id}
              className={cn(
                "group flex items-center gap-1 rounded-xl border px-2 py-1.5 text-sm transition",
                s.id === activeId ? "border-brand bg-brand/10 text-fg shadow-glow" : "border-border bg-surface-2 hover:bg-border/40",
              )}
            >
              {editingSceneId === s.id ? (
                <input
                  autoFocus
                  value={s.name}
                  onChange={(e) => renameScene(s.id, e.target.value)}
                  onBlur={() => setEditingSceneId(null)}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditingSceneId(null); }}
                  className="input h-7 flex-1 py-0 text-sm"
                />
              ) : (
                <button onClick={() => switchScene(s.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <LayersIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="truncate">{s.name}</span>
                  {s.id === activeId && live && <span className="h-2 w-2 shrink-0 rounded-full bg-live animate-pulse-live" />}
                </button>
              )}
              <button onClick={() => setEditingSceneId(s.id)} className="shrink-0 text-muted opacity-0 hover:text-fg group-hover:opacity-100" title="Renombrar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {scenes.length > 1 && (
                <button onClick={() => deleteScene(s.id)} className="shrink-0 text-muted opacity-0 hover:text-danger group-hover:opacity-100" title="Eliminar escena">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
          {/* El canvas del compositor se monta aquí (imperativo). */}
          <div ref={previewRef} className="absolute inset-0" />
          {/* Capa interactiva: arrastrar y redimensionar la capa seleccionada. */}
          <PreviewOverlay
            layer={selected}
            onChange={(t) =>
              selected &&
              updateLayer(
                selected.id,
                (l) => ({ ...l, transform: { ...l.transform, ...t } }) as Layer,
              )
            }
          />
          <div className="pointer-events-none absolute left-3 top-3 z-30">
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
          <button onClick={() => void save(false)} className="btn-ghost" disabled={saving}>
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
                <button onClick={(e) => { e.stopPropagation(); reorderLayer(l.id, "up"); }} className="text-muted hover:text-fg" title="Traer al frente">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); reorderLayer(l.id, "down"); }} className="text-muted hover:text-fg" title="Enviar atrás">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }} className="text-muted hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>

        {selected && (
          <div className="mt-3 border-t border-border pt-3">
            <LayerEditor
              layer={selected}
              cameras={cameras}
              onChange={(patch) => updateLayer(selected.id, patch)}
              onSelectCamera={(id) => selectCamera(selected.id, id)}
              onReconnectScreen={reconnectScreen}
              onStatus={setStatus}
            />
          </div>
        )}
      </aside>
    </div>
  );
}

function LayerEditor({
  layer,
  cameras,
  onChange,
  onSelectCamera,
  onReconnectScreen,
  onStatus,
}: {
  layer: Layer;
  cameras: Camera[];
  onChange: (patch: (l: Layer) => Layer) => void;
  onSelectCamera: (deviceId: string) => void;
  onReconnectScreen: () => void;
  onStatus: (s: string | null) => void;
}) {
  const t = layer.transform;
  const setT = (k: keyof typeof t, v: number) =>
    onChange((l) => ({ ...l, transform: { ...l.transform, [k]: v } }) as Layer);
  const setProp = (k: string, v: any) =>
    onChange((l) => ({ ...l, props: { ...(l as any).props, [k]: v } }) as Layer);

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      onStatus("La imagen es muy grande (máx. 4 MB)");
      setTimeout(() => onStatus(null), 2500);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProp("src", String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3 text-sm">
      <span className="label">Propiedades</span>

      {layer.type === "webcam" && (
        <div>
          <label className="label">Cámara</label>
          <select
            className="input mt-1"
            value={(layer as any).props?.deviceId ?? ""}
            onChange={(e) => onSelectCamera(e.target.value)}
          >
            <option value="">Predeterminada</option>
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>{c.label}</option>
            ))}
          </select>
          {cameras.length === 0 && (
            <p className="mt-1 text-xs text-muted">Concede permiso de cámara para ver la lista.</p>
          )}
        </div>
      )}

      {layer.type === "screen" && (
        <button className="btn-ghost w-full" onClick={onReconnectScreen}>
          <RefreshCw className="h-4 w-4" /> Reconectar pantalla
        </button>
      )}

      {layer.type === "text" && (
        <>
          <textarea className="input" rows={2} value={(layer as any).props.text} onChange={(e) => setProp("text", e.target.value)} />
          <div className="flex items-center gap-2">
            <input type="color" value={(layer as any).props.color} onChange={(e) => setProp("color", e.target.value)} className="h-8 w-10 rounded" />
            <input type="number" className="input" value={(layer as any).props.fontSize} onChange={(e) => setProp("fontSize", Number(e.target.value))} />
          </div>
        </>
      )}

      {layer.type === "image" && (
        <>
          <input className="input" placeholder="URL de la imagen" value={(layer as any).props.src} onChange={(e) => setProp("src", e.target.value)} />
          <label className="btn-ghost w-full cursor-pointer">
            <Upload className="h-4 w-4" /> Subir desde tu PC
            <input type="file" accept="image/*" className="hidden" onChange={onImageFile} />
          </label>
          <select className="input" value={(layer as any).props.fit} onChange={(e) => setProp("fit", e.target.value)}>
            <option value="cover">Rellenar (cover)</option>
            <option value="contain">Ajustar (contain)</option>
          </select>
        </>
      )}

      {layer.type === "background" && (
        <div className="flex items-center gap-2">
          <input type="color" value={(layer as any).props.color} onChange={(e) => setProp("color", e.target.value)} className="h-8 w-10 rounded" />
          <input type="color" value={(layer as any).props.gradientTo ?? "#000000"} onChange={(e) => setProp("gradientTo", e.target.value)} className="h-8 w-10 rounded" />
          <span className="text-xs text-muted">color · degradado</span>
        </div>
      )}

      {layer.type === "alerts" && (
        <p className="text-xs text-muted">
          Esta zona define <strong>dónde</strong> aparecen las notificaciones (donaciones,
          canjes, etc.). Mueve/redimensiona con los deslizadores. Basta con una por escena.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k} className="space-y-1">
            <span className="text-xs uppercase text-muted">{k}</span>
            <input type="range" min={0} max={1} step={0.01} value={t[k]} onChange={(e) => setT(k, Number(e.target.value))} className="w-full" />
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

// Capa interactiva sobre el preview: arrastrar (mover) y redimensionar la capa seleccionada.
function PreviewOverlay({
  layer,
  onChange,
}: {
  layer: Layer | null;
  onChange: (t: Partial<Transform>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | null
    | { mode: "move" | "resize"; sx: number; sy: number; start: Transform; rectW: number; rectH: number }
  >(null);

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    if (!layer || !ref.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = ref.current.getBoundingClientRect();
    drag.current = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      start: { ...layer.transform },
      rectW: rect.width,
      rectH: rect.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.rectW;
    const dy = (e.clientY - d.sy) / d.rectH;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (d.mode === "move") {
      onChange({ x: clamp(d.start.x + dx, 0, 1 - d.start.w), y: clamp(d.start.y + dy, 0, 1 - d.start.h) });
    } else {
      onChange({ w: clamp(d.start.w + dx, 0.05, 1 - d.start.x), h: clamp(d.start.h + dy, 0.05, 1 - d.start.y) });
    }
  }
  function end(e: React.PointerEvent) {
    drag.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-20">
      {layer && (
        <div
          onPointerDown={(e) => begin("move", e)}
          onPointerMove={move}
          onPointerUp={end}
          className="pointer-events-auto absolute cursor-move rounded border-2 border-accent/80 bg-accent/5"
          style={{
            left: `${layer.transform.x * 100}%`,
            top: `${layer.transform.y * 100}%`,
            width: `${layer.transform.w * 100}%`,
            height: `${layer.transform.h * 100}%`,
          }}
        >
          <div
            onPointerDown={(e) => begin("resize", e)}
            onPointerMove={move}
            onPointerUp={end}
            className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-black/60 bg-accent"
          />
        </div>
      )}
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
