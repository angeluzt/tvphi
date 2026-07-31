"use client";

import { useEffect, useState } from "react";
import { Sparkles, KeyRound, Loader2, Check, Trash2, RefreshCw } from "lucide-react";
import { CONOCIDOS, VOCES, nota, type Tarea } from "@/lib/story/modelos";

// Escribir un capítulo con IA.
//
// Dos partes: la clave de OpenAI (de cada usuario, guardada cifrada en el
// servidor) y el encargo. Lo que devuelve la IA NO se guarda solo: se enseña y
// tú decides si lo abres. Estrenar esto escribiendo encima de lo que estás
// editando sería la peor forma posible de empezar.

// Una lista para elegir, con salida de emergencia.
//
// Se elige de una lista porque nadie se sabe los nombres de los modelos de
// memoria. Pero OpenAI saca modelos nuevos cada poco, así que «Otro…» deja
// escribir uno a mano: la lista no puede convertirse en una jaula.
function Elegir({
  etiqueta, valor, opciones, onCambio,
}: {
  etiqueta: string; valor: string; opciones: string[]; onCambio: (v: string) => void;
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
        <option key={o} value={o}>{nota(o) ? `${o} · ${nota(o)}` : o}</option>
      ))}
      <option value="__otro__">Otro… (escribirlo a mano)</option>
    </select>
  );
}

export function IaPanel({
  onGenerado,
}: {
  onGenerado: (name: string, project: unknown) => void;
}) {
  const [estado, setEstado] = useState<{ configurada: boolean; pista: string | null; models?: any } | null>(null);
  // Un modelo por tarea: no todos hacen de todo (los baratos de texto no dan
  // audio). Se copian tal cual de platform.openai.com.
  const [mods, setMods] = useState({ texto: "", imagen: "", voz: "", vozNombre: "alloy" });
  const [clave, setClave] = useState("");
  const [prompt, setPrompt] = useState("");
  const [escenas, setEscenas] = useState(6);
  const [ocupado, setOcupado] = useState<null | "clave" | "generar">(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  // Los modelos que puede usar esta cuenta. Se le preguntan a OpenAI para no
  // enseñar una lista escrita a fuego que envejece.
  const [lista, setLista] = useState<Record<Tarea, string[]>>(CONOCIDOS);
  const [deLaCuenta, setDeLaCuenta] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(false);

  const leer = () =>
    fetch("/api/story/ia/clave").then((r) => r.json()).then((j) => {
      setEstado(j);
      if (j?.models) setMods((m) => ({ ...m, ...j.models }));
      return j;
    }).catch(() => null);

  const leerLista = async () => {
    setCargandoLista(true);
    try {
      const j = await (await fetch("/api/story/ia/modelos")).json();
      if (j?.modelos) { setLista(j.modelos); setDeLaCuenta(!!j.deLaCuenta); }
      return j?.modelos as Record<Tarea, string[]> | undefined;
    } catch { return undefined; } finally { setCargandoLista(false); }
  };

  useEffect(() => { void (async () => {
    const j = await leer();
    const l = await leerLista();
    // Si nunca ha elegido nada, se deja preparada la primera opción de cada
    // tarea: así no se encuentra tres huecos vacíos sin saber qué poner. No se
    // guarda solo; hay que darle a «Guardar modelos».
    if (l) setMods((m) => ({
      ...m,
      texto: m.texto || j?.models?.texto || l.texto?.[0] || "",
      voz: m.voz || j?.models?.voz || l.voz?.[0] || "",
      imagen: m.imagen || j?.models?.imagen || l.imagen?.[0] || "",
    }));
  })(); }, []);

  async function guardarClave() {
    setOcupado("clave"); setAviso(null);
    try {
      const r = await fetch("/api/story/ia/clave", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: clave, models: mods }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      setClave("");
      await leer();
      // Ya con clave se puede preguntar qué modelos tiene ESTA cuenta.
      await leerLista();
      setAviso("Clave guardada ✓");
    } catch (e: any) { setAviso(e?.message ?? "No se pudo guardar"); }
    setOcupado(null);
  }

  async function borrarClave() {
    if (!confirm("¿Quitar tu clave de OpenAI?")) return;
    await fetch("/api/story/ia/clave", { method: "DELETE" });
    await leer();
    setAviso("Clave quitada");
  }

  async function guardarModelos() {
    setOcupado("clave"); setAviso(null);
    try {
      const r = await fetch("/api/story/ia/clave", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: mods }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      await leer();
      setAviso("Modelos guardados ✓");
    } catch (e: any) { setAviso(e?.message ?? "No se pudo guardar"); }
    setOcupado(null);
  }

  async function generar() {
    setOcupado("generar"); setAviso(null);
    try {
      const r = await fetch("/api/story/ia/capitulo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, escenas, modelo: mods.texto.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      onGenerado(j.name, j.project);
      setAviso(`Capítulo escrito ✓ · ${j.imagenes} escenas. Ábrelo y pon tus imágenes.`);
    } catch (e: any) { setAviso(e?.message ?? "No se pudo generar"); }
    setOcupado(null);
  }

  return (
    <div className="card p-4">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-accent" />
        <span className="label flex-1">Escribir un capítulo con IA</span>
        {estado?.configurada && <span className="chip bg-accent/15 text-accent">clave puesta</span>}
      </button>

      {abierto && (
        <div className="mt-3 space-y-3">
          {/* ── la clave ── */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs text-muted">Tu clave de OpenAI</span>
              {estado?.configurada && (
                <>
                  <span className="ml-auto text-xs tabular-nums text-accent">{estado.pista}</span>
                  <button onClick={borrarClave} className="text-muted hover:text-danger" title="Quitar la clave">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                className="input min-w-0 flex-1 text-sm"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder={estado?.configurada ? "Poner otra clave…" : "sk-…"}
                aria-label="Clave de OpenAI"
              />
              <button onClick={guardarClave} disabled={!clave.trim() || ocupado === "clave"}
                className="btn-ghost shrink-0 text-xs disabled:opacity-40">
                {ocupado === "clave" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-accent" />}
                Guardar
              </button>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Se guarda cifrada en el servidor y no vuelve a salir de ahí: aquí solo verás sus
              últimos cuatro caracteres. El gasto corre por tu cuenta de OpenAI.
            </p>
          </div>

          {/* ── el encargo ── */}
          <div>
            <span className="text-xs text-muted">De qué va el capítulo</span>
            <textarea
              className="input mt-1 h-24 w-full text-sm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-label="De qué va el capítulo"
              placeholder="Un pueblo que quedó bajo un embalse y reaparece con la sequía. Tono documental, inquietante, sin música alegre."
            />
          </div>
          {/* Un modelo por tarea. No es capricho: los modelos baratos de texto
              NO generan audio, así que uno solo para todo no funciona. */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Modelos, uno por tarea</span>
              <button onClick={() => void leerLista()} disabled={cargandoLista}
                className="btn-ghost ml-auto text-[11px] disabled:opacity-40" title="Volver a mirar qué modelos tiene tu cuenta">
                {cargandoLista ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Actualizar
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {deLaCuenta
                ? "Esta lista sale de tu propia cuenta de OpenAI: son los que tu clave puede usar."
                : "Lista de referencia. En cuanto guardes tu clave se sustituye por los que tenga tu cuenta."}
            </p>
            <div className="mt-2 space-y-2">
              {([
                ["texto", "Escribir el capítulo", "El más barato vale: solo tiene que seguir el catálogo que se le manda."],
                ["voz", "Narrar los diálogos", "Tiene que admitir audio. Los de texto, por caros que sean, no narran."],
                ["imagen", "Generar imágenes", "Aún no se usa: queda para cuando conectemos las imágenes."],
              ] as const).map(([k, etq, ayuda]) => (
                <label key={k} className="block">
                  <span className="text-[11px] text-muted">{etq}</span>
                  <Elegir
                    etiqueta={etq}
                    valor={(mods as any)[k]}
                    opciones={lista[k] ?? []}
                    onCambio={(v) => setMods((m) => ({ ...m, [k]: v }))}
                  />
                  <span className="mt-0.5 block text-[11px] text-muted">{ayuda}</span>
                </label>
              ))}
              <label className="block">
                <span className="text-[11px] text-muted">Voz</span>
                <Elegir
                  etiqueta="Voz"
                  valor={mods.vozNombre}
                  opciones={VOCES}
                  onCambio={(v) => setMods((m) => ({ ...m, vozNombre: v }))}
                />
                <span className="mt-0.5 block text-[11px] text-muted">
                  Cómo suena quien narra. Si no te convence, prueba otra.
                </span>
              </label>
            </div>
            <button onClick={guardarModelos} disabled={!estado?.configurada || ocupado === "clave"}
              className="btn-ghost mt-2 w-full text-xs disabled:opacity-40">
              <Check className="h-4 w-4 text-accent" /> Guardar modelos
            </button>
            {estado?.configurada && mods.voz && (
              <p className="mt-2 text-[11px] text-accent">
                La narración la hará OpenAI en vez del modelo del navegador.
              </p>
            )}
          </div>
          <label className="block">
            <span className="text-xs text-muted">Escenas: {escenas}</span>
            <input type="range" min={2} max={12} step={1} value={escenas}
              onChange={(e) => setEscenas(Number(e.target.value))} className="mt-1 w-full" />
          </label>

          <button
            onClick={generar}
            disabled={!estado?.configurada || prompt.trim().length < 4 || ocupado === "generar"}
            className="btn-brand w-full text-sm disabled:opacity-40"
          >
            {ocupado === "generar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {ocupado === "generar" ? "Escribiendo…" : "Escribir el capítulo"}
          </button>

          <p className="text-[11px] text-muted">
            Escribe el montaje: escenas, tomas, narración y efectos. <strong>Las imágenes las pones
            tú</strong>: al abrirlo saldrán como faltantes y se reponen con «Buscar». Nada se guarda
            hasta que tú lo abras.
          </p>

          {aviso && <p className="text-sm text-accent">{aviso}</p>}
        </div>
      )}
    </div>
  );
}
