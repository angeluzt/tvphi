"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Plus, Trash2, Save, Loader2, Users, ImagePlus, Copy, Check } from "lucide-react";
import { putAsset, assetUrl, cachedUrl, deleteAsset } from "@/lib/story/store";
import {
  emptyCharacterData, normalizeCharacterData,
  type Character, type CharacterData, type CharImage,
} from "@/lib/story/characters";

// Fichas de personaje. Hoy es una libreta: no genera nada ni toca los videos.
// Sirve para que el personaje se parezca a sí mismo de un capítulo a otro, que
// es donde se cae este tipo de canal.

export function CharactersApp({
  initial, series, serieInicial,
}: {
  initial: Character[];
  series: { id: string; name: string }[];
  serieInicial: string | null;
}) {
  const [chars, setChars] = useState<Character[]>(initial);
  // Los personajes son de una serie: si estás dentro de "Crónicas", ves los
  // suyos y los que crees nacen ahí. "Sin serie" para los que no son de ninguna
  // (y para todo lo que había antes de que existieran las series).
  const [serie, setSerie] = useState<string | null>(serieInicial);
  const [sel, setSel] = useState<string | null>(initial[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const visibles = chars.filter((c) => (c.seriesId ?? null) === serie);
  const actual = visibles.find((c) => c.id === sel) ?? null;

  function mut(id: string, fn: (c: Character) => Character) {
    setChars((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }

  async function crear() {
    setBusy(true);
    try {
      const r = await fetch("/api/story/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Personaje nuevo", data: emptyCharacterData(), seriesId: serie }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      // Se fuerza la serie en la que estamos: si la respuesta no la trajera, el
      // personaje recién creado desaparecería del filtro nada más nacer.
      const c: Character = { ...j.character, seriesId: j.character.seriesId ?? serie, data: normalizeCharacterData(j.character.data) };
      setChars((prev) => [c, ...prev]);
      setSel(c.id);
      setStatus("Ficha creada ✓");
    } catch (e: any) {
      setStatus("No se pudo crear: " + (e?.message ?? ""));
    }
    setBusy(false);
  }

  async function guardar(c: Character) {
    setBusy(true);
    try {
      const r = await fetch("/api/story/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, name: c.name.trim() || "Sin nombre", data: c.data, seriesId: c.seriesId ?? null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      setStatus("Guardado ✓");
    } catch (e: any) {
      setStatus("No se pudo guardar: " + (e?.message ?? ""));
    }
    setBusy(false);
  }

  async function borrar(c: Character) {
    if (!confirm(`¿Borrar la ficha de "${c.name}"? Sus imágenes se quitan de este navegador.`)) return;
    setBusy(true);
    await fetch(`/api/story/characters?id=${c.id}`, { method: "DELETE" });
    for (const im of c.data.images) await deleteAsset(im.id);
    setChars((prev) => prev.filter((x) => x.id !== c.id));
    setSel((s) => (s === c.id ? null : s));
    setBusy(false);
    setStatus("Ficha borrada");
  }

  async function subirImagenes(c: Character, files: File[]) {
    const nuevas: CharImage[] = [];
    for (const f of files) {
      const id = nanoid(10);
      await putAsset(id, f);
      nuevas.push({ id, name: f.name });
    }
    mut(c.id, (x) => ({ ...x, data: { ...x.data, images: [...x.data.images, ...nuevas] } }));
    setStatus(`${nuevas.length} ${nuevas.length === 1 ? "imagen añadida" : "imágenes añadidas"} · recuerda guardar`);
  }

  return (
    <div className="tool-ui grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Lista de personajes */}
      <div className="card h-fit p-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          <span className="label">Personajes</span>
          <button onClick={crear} disabled={busy} className="btn-brand ml-auto py-1 text-xs disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" /> Nuevo
          </button>
        </div>
        {/* De qué serie son los personajes que se ven. */}
        <select
          className="input mt-2 w-full text-sm"
          value={serie ?? ""}
          onChange={(e) => { setSerie(e.target.value || null); setSel(null); }}
        >
          <option value="">Sin serie</option>
          {series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="mt-2 space-y-1">
          {visibles.map((c) => (
            <button
              key={c.id}
              onClick={() => setSel(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm ${
                sel === c.id ? "border-accent bg-accent/10" : "border-border hover:bg-surface-2"
              }`}
            >
              <Retrato id={c.data.images[0]?.id} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="shrink-0 text-[11px] text-muted">{c.data.images.length}</span>
            </button>
          ))}
          {!visibles.length && (
            <p className="py-3 text-center text-[11px] text-muted">
              Aún no hay personajes aquí. Crea uno y ve metiéndole sus imágenes base.
            </p>
          )}
        </div>
      </div>

      {/* Ficha */}
      {actual ? (
        <Ficha
          key={actual.id}
          c={actual}
          busy={busy}
          onChange={(fn) => mut(actual.id, fn)}
          onGuardar={() => guardar(actual)}
          onBorrar={() => borrar(actual)}
          onSubir={(files) => subirImagenes(actual, files)}
        />
      ) : (
        <div className="card grid place-items-center p-8 text-center text-sm text-muted">
          Elige un personaje de la lista, o crea uno nuevo.
        </div>
      )}

      {status && <p className="text-sm text-accent lg:col-span-2">{status}</p>}
    </div>
  );
}

function Ficha({
  c, busy, onChange, onGuardar, onBorrar, onSubir,
}: {
  c: Character;
  busy: boolean;
  onChange: (fn: (c: Character) => Character) => void;
  onGuardar: () => void;
  onBorrar: () => void;
  onSubir: (files: File[]) => void;
}) {
  const set = (k: keyof CharacterData, v: string) =>
    onChange((x) => ({ ...x, data: { ...x.data, [k]: v } }));

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input min-w-0 flex-1 text-sm font-medium"
            value={c.name}
            onChange={(e) => onChange((x) => ({ ...x, name: e.target.value }))}
            aria-label="Nombre del personaje"
            placeholder="Nombre del personaje"
          />
          <button onClick={onGuardar} disabled={busy} className="btn-brand text-xs disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </button>
          <button onClick={onBorrar} disabled={busy} className="btn-ghost text-xs text-muted hover:text-danger disabled:opacity-40">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Esto es una libreta: no genera imágenes ni cambia tus videos. Sirve para que el personaje
          se parezca a sí mismo de un capítulo a otro.
        </p>
      </div>

      <div className="card p-3">
        <span className="label">Cómo es</span>
        <textarea
          className="input mt-2 h-24 w-full text-sm"
          value={c.data.description}
          onChange={(e) => set("description", e.target.value)}
          aria-label="Cómo es el personaje"
          placeholder="Edad, ropa, rasgos, cicatrices, manías… lo que tenga que salir igual siempre."
        />
      </div>

      <div className="card p-3">
        <span className="label">Con qué se creó</span>
        <p className="mt-1 text-[11px] text-muted">
          Con el prompt solo no se repite una imagen: hacen falta también el modelo y la semilla.
          Por eso van los tres.
        </p>
        <Campo etiqueta="Prompt" valor={c.data.prompt} onChange={(v) => set("prompt", v)} alto
          ayuda="El prompt base del personaje, el que describe cómo tiene que salir siempre." />
        <Campo etiqueta="Lo que NO quieres (negativo)" valor={c.data.negative} onChange={(v) => set("negative", v)}
          ayuda="Los generadores lo piden aparte: manos raras, texto, marcas de agua…" />
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Campo etiqueta="Modelo y versión" valor={c.data.model} onChange={(v) => set("model", v)}
            ayuda="Sin esto, el mismo prompt da otra cara dentro de seis meses." />
          <Campo etiqueta="Semilla" valor={c.data.seed} onChange={(v) => set("seed", v)}
            ayuda="El número que hace que salga la misma imagen." />
        </div>
        <Campo etiqueta="Ajustes" valor={c.data.params} onChange={(v) => set("params", v)}
          ayuda="Pasos, cfg, tamaño… en texto libre, que cada IA usa lo suyo." />
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-2">
          <span className="label">Imágenes base</span>
          <label className="btn-ghost ml-auto cursor-pointer text-xs">
            <ImagePlus className="h-4 w-4 text-accent" /> Añadir
            <input
              type="file" accept="image/*" multiple className="hidden"
              // Se copian los archivos ANTES de limpiar el input: vaciar el
              // value deja la FileList original sin nada, y se perdían.
              onChange={(e) => {
                const f = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (f.length) onSubir(f);
              }}
            />
          </label>
        </div>
        {c.data.images.length ? (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {c.data.images.map((im) => (
              <Miniatura
                key={im.id}
                im={im}
                onChange={(t) => onChange((x) => ({
                  ...x, data: { ...x.data, images: x.data.images.map((y) => (y.id === im.id ? { ...y, ...t } : y)) },
                }))}
                onQuitar={() => onChange((x) => ({
                  ...x, data: { ...x.data, images: x.data.images.filter((y) => y.id !== im.id) },
                }))}
              />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted">
            Mete aquí las imágenes que ya te gustaron del personaje: de frente, de perfil, de cuerpo
            entero. Son la referencia a la que volver.
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted">
          Las imágenes se quedan en este navegador. La ficha sí va en tu cuenta.
        </p>
      </div>

      <div className="card p-3">
        <span className="label">Notas</span>
        <textarea
          className="input mt-2 h-20 w-full text-sm"
          value={c.data.notes}
          onChange={(e) => set("notes", e.target.value)}
          aria-label="Notas"
          placeholder="Lo que no cabe en lo de arriba: en qué capítulos sale, qué le pasó, qué no hay que hacerle."
        />
      </div>
    </div>
  );
}

function Campo({
  etiqueta, valor, onChange, ayuda, alto,
}: {
  etiqueta: string; valor: string; onChange: (v: string) => void; ayuda?: string; alto?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  return (
    <label className="mt-2 block">
      <span className="flex items-center gap-2 text-xs text-muted">
        {etiqueta}
        {!!valor && (
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1200); }}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted hover:text-fg"
            title="Copiar para pegarlo en el generador"
          >
            {copiado ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        )}
      </span>
      {alto ? (
        <textarea className="input mt-1 h-20 w-full text-sm" value={valor} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input mt-1 w-full text-sm" value={valor} onChange={(e) => onChange(e.target.value)} />
      )}
      {ayuda && <span className="mt-0.5 block text-[11px] text-muted">{ayuda}</span>}
    </label>
  );
}

function Miniatura({
  im, onChange, onQuitar,
}: {
  im: CharImage; onChange: (t: Partial<CharImage>) => void; onQuitar: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-1.5">
      <div className="relative aspect-square w-full overflow-hidden rounded bg-surface-2">
        <Retrato id={im.id} grande />
        <button
          onClick={onQuitar}
          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded bg-black/60 text-white hover:bg-danger"
          title="Quitar esta imagen de la ficha"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <input
        className="input mt-1 w-full text-[11px]"
        value={im.prompt ?? ""}
        onChange={(e) => onChange({ prompt: e.target.value })}
        placeholder="Prompt de esta imagen"
        aria-label={`Prompt de ${im.name}`}
      />
    </div>
  );
}

// Las imágenes viven en el navegador; se piden por id como en el resto de la app.
function Retrato({ id, grande }: { id?: string; grande?: boolean }) {
  const [url, setUrl] = useState<string | null>(() => (id ? cachedUrl(id) : null));
  useEffect(() => {
    let vivo = true;
    if (id && !url) assetUrl(id).then((u) => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [id, url]);
  const clase = grande ? "h-full w-full object-cover" : "h-7 w-7 shrink-0 rounded object-cover";
  if (!id || !url) {
    return <span className={`${grande ? "grid h-full w-full place-items-center" : "h-7 w-7 shrink-0 rounded"} bg-surface-2 text-[10px] text-muted`}>
      {grande ? "sin imagen" : ""}
    </span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={clase} />;
}
