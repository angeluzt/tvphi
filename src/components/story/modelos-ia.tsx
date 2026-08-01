"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Play, AlertTriangle } from "lucide-react";
import { CONOCIDOS, VOCES, nota, comoSuena, type Tarea } from "@/lib/story/modelos";

// Elegir qué modelo hace cada cosa.
//
// Vive aparte del panel de inicio porque hace falta en DOS sitios: al encargar
// el capítulo y, sobre todo, DENTRO del editor. Si la narración falla a mitad
// —porque el modelo que elegiste lo han retirado, por ejemplo— tener que salir
// del editor para cambiarlo deja al usuario encerrado, y encima habiendo pagado.

// Una lista para elegir, con salida de emergencia.
//
// Se elige de una lista porque nadie se sabe los nombres de los modelos de
// memoria. Pero OpenAI saca modelos nuevos cada poco, así que «Otro…» deja
// escribir uno a mano: la lista no puede convertirse en una jaula.
export function Elegir({
  etiqueta, valor, opciones, onCambio, fallidos = [], describe,
}: {
  etiqueta: string; valor: string; opciones: string[];
  onCambio: (v: string) => void;
  // Los que ya fallaron en esta cuenta, para avisarlo en la propia opción.
  fallidos?: string[];
  // Qué decir de cada opción. Para las voces, cómo suenan.
  describe?: (id: string) => string;
}) {
  // Si lo guardado no está en la lista (modelo nuevo, o escrito a mano), se
  // sigue viendo: no se le puede borrar la elección al usuario por callado.
  const suelto = !!valor && !opciones.includes(valor);
  const [aMano, setAMano] = useState(false);

  if (aMano) {
    return (
      <div className="mt-0.5 flex gap-2">
        <input
          className="input min-w-0 flex-1 text-sm"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          aria-label={etiqueta}
          placeholder="nombre exacto, de platform.openai.com"
          autoFocus
        />
        <button onClick={() => setAMano(false)} className="btn-ghost shrink-0 text-[11px]">Lista</button>
      </div>
    );
  }
  return (
    <select
      className="input mt-0.5 w-full text-sm"
      value={valor}
      aria-label={etiqueta}
      onChange={(e) => {
        if (e.target.value === "__otro__") { setAMano(true); return; }
        onCambio(e.target.value);
      }}
    >
      {!valor && <option value="">Elige uno…</option>}
      {suelto && <option value={valor}>{valor} · el que tenías puesto</option>}
      {opciones.map((o) => (
        <option key={o} value={o}>
          {(() => { const n = describe ? describe(o) : nota(o, fallidos); return n ? `${o} · ${n}` : o; })()}
        </option>
      ))}
      <option value="__otro__">Otro… (escribirlo a mano)</option>
    </select>
  );
}

const ETIQUETAS: Record<Tarea, [string, string]> = {
  texto: ["Escribir el capítulo", "El más barato vale: solo tiene que seguir el catálogo que se le manda."],
  voz: ["Narrar los diálogos", "Elige uno de voz (lleva «tts» en el nombre): LEE el texto y no puede añadir nada. Los de chat con audio a veces rematan con un «¿te gustó?»."],
  imagen: ["Generar imágenes", "El que dibuja las escenas que falten, desde el texto de cada una."],
};

export function ModelosIa({
  tareas, titulo, onGuardado, onCambio, recargar,
}: {
  tareas: Tarea[];
  titulo?: string;
  // Sube de número para pedir que vuelva a mirar la cuenta (p. ej. al guardar
  // una clave nueva: hasta entonces no hay forma de saber qué modelos tiene).
  recargar?: number;
  onGuardado?: (mods: any) => void;
  // Avisa de lo elegido aunque aún no se haya guardado: quien encarga el
  // capítulo tiene que usar lo que se ve en pantalla, no lo de la última vez.
  onCambio?: (mods: any) => void;
}) {
  const [mods, setMods] = useState({ texto: "", imagen: "", voz: "", vozNombre: "alloy" });
  const [lista, setLista] = useState<Record<Tarea, string[]>>(CONOCIDOS);
  const [deLaCuenta, setDeLaCuenta] = useState(false);
  // Los que ya fallaron en esta cuenta: salen marcados y al final.
  const [fallidos, setFallidos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const leerLista = async () => {
    setCargando(true);
    try {
      const j = await (await fetch("/api/story/ia/modelos")).json();
      if (j?.modelos) { setLista(j.modelos); setDeLaCuenta(!!j.deLaCuenta); setFallidos(j.fallidos ?? []); }
      return j?.modelos as Record<Tarea, string[]> | undefined;
    } catch { return undefined; } finally { setCargando(false); }
  };

  useEffect(() => { void (async () => {
    const j = await fetch("/api/story/ia/clave").then((r) => r.json()).catch(() => null);
    const l = await leerLista();
    setMods((m) => ({
      ...m, ...(j?.models ?? {}),
      texto: j?.models?.texto || l?.texto?.[0] || "",
      voz: j?.models?.voz || l?.voz?.[0] || "",
      imagen: j?.models?.imagen || l?.imagen?.[0] || "",
    }));
  })(); }, []);

  // Se guarda solo.
  //
  // Antes había que darle a «Guardar modelos» después de cada cambio, y elegir
  // otra voz sin pulsarlo no hacía nada: parecía roto. Elegir de una lista YA
  // es la confirmación; pedir otra encima sobra.
  // Solo se guarda lo que el usuario TOCA. Cargar la pantalla no es un cambio:
  // guardar entonces mandaba un aviso de «guardado» que no venía de nadie y
  // llegó a cerrar el panel de rescate justo al abrirse.
  const tocado = useRef(false);
  useEffect(() => {
    if (!tocado.current) return;
    const t = setTimeout(() => { void guardar(true); }, 600);  // sin ir a cada tecla
    return () => clearTimeout(t);
  }, [mods]);
  const cambiar = (patch: Partial<typeof mods>) => {
    tocado.current = true;
    setMods((m) => ({ ...m, ...patch }));
  };

  async function guardar(callado = false) {
    if (!callado) setAviso(null);
    try {
      const r = await fetch("/api/story/ia/clave", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: mods }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      if (!callado) setAviso("Guardado ✓");
      onGuardado?.(mods);
    } catch (e: any) {
      // Un fallo al guardar SÍ se dice, aunque el guardado fuera automático:
      // callarlo dejaría al usuario creyendo que cambió algo que no cambió.
      setAviso(e?.message ?? "No se pudo guardar");
    }
  }

  // Probar la voz ANTES de narrar el capítulo entero.
  //
  // Esto existe por un caso real: se eligió un modelo retirado, falló al narrar
  // y el usuario se quedó sin salida habiendo pagado ya la escritura. Una frase
  // de tres palabras cuesta una miseria y te dice si ese modelo sirve.
  async function probarVoz() {
    setProbando(true); setAviso(null);
    try {
      // Se guarda primero: si no, se probaría una cosa y se usaría otra.
      await fetch("/api/story/ia/clave", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: mods }),
      });
      const r = await fetch("/api/story/ia/voz", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: "Probando la voz.", modelo: mods.voz, voz: mods.vozNombre }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      const bin = atob(j.audio);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: "audio/wav" }));
      if (audioRef.current) audioRef.current.src = url;
      await audioRef.current?.play().catch(() => {});
      setAviso("Este modelo sirve ✓ · ya puedes narrar el capítulo");
      onGuardado?.(mods);
    } catch (e: any) {
      setAviso(e?.message ?? "No se pudo probar");
    } finally { setProbando(false); }
  }

  // Al cambiar la clave, la lista de la cuenta ya es otra.
  useEffect(() => { if (recargar) void leerLista(); }, [recargar]);

  const avisar = useRef(onCambio);
  avisar.current = onCambio;
  useEffect(() => { avisar.current?.(mods); }, [mods]);

  const malo = aviso && !aviso.includes("✓");

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">{titulo ?? "Modelos, uno por tarea"}</span>
        <button onClick={() => void leerLista()} disabled={cargando}
          className="btn-ghost ml-auto text-[11px] disabled:opacity-40" title="Volver a mirar qué modelos tiene tu cuenta">
          {cargando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Actualizar
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {deLaCuenta
          ? "Esta lista sale de tu propia cuenta de OpenAI: son los que tu clave puede usar."
          : "Lista de referencia. En cuanto guardes tu clave se sustituye por los que tenga tu cuenta."}
      </p>

      <div className="mt-2 space-y-2">
        {tareas.map((k) => (
          <label key={k} className="block">
            <span className="text-[11px] text-muted">{ETIQUETAS[k][0]}</span>
            <Elegir
              etiqueta={ETIQUETAS[k][0]}
              valor={(mods as any)[k]}
              opciones={lista[k] ?? []}
              fallidos={fallidos}
              onCambio={(v) => cambiar({ [k]: v } as any)}
            />
            <span className="mt-0.5 block text-[11px] text-muted">{ETIQUETAS[k][1]}</span>
          </label>
        ))}
        {tareas.includes("voz") && (
          <label className="block">
            <span className="text-[11px] text-muted">Voz</span>
            <Elegir
              etiqueta="Voz"
              valor={mods.vozNombre}
              opciones={VOCES}
              describe={comoSuena}
              onCambio={(v) => cambiar({ vozNombre: v })}
            />
            <span className="mt-0.5 block text-[11px] text-muted">
              {comoSuena(mods.vozNombre) || "Cómo suena quien narra."}
            </span>
          </label>
        )}
      </div>

      {tareas.includes("voz") && (
        <button onClick={() => void probarVoz()} disabled={probando || !mods.voz}
          className="btn-ghost mt-2 w-full text-xs disabled:opacity-40"
          title="Narra tres palabras para ver si ese modelo sirve">
          {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 text-accent" />}
          Probar la voz
        </button>
      )}
      {tareas.includes("voz") && (
        <p className="mt-1 text-[11px] text-muted">
          Pruébala antes de narrar el capítulo entero: son tres palabras y te ahorra descubrir
          a medias que ese modelo no sirve.
        </p>
      )}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} className="hidden" />
      {aviso && (
        <p className={`mt-2 flex items-start gap-1.5 text-[11px] ${malo ? "text-danger" : "text-accent"}`}>
          {malo && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
          <span>{aviso}</span>
        </p>
      )}
    </div>
  );
}
