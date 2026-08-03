"use client";

import { useState } from "react";
import { Sparkles, Trash2, Copy, Plus, Search, ChevronDown, ChevronRight } from "lucide-react";
import { nanoid } from "nanoid";
import { Slider } from "./slider";
import { NumberInput } from "./number-input";
import {
  VFX, vfxSpec, vfxDefaults, SHAPE_LABEL, GROUP_LABEL,
  type VfxKind, type VfxShape, type VfxGroup,
} from "@/lib/story/vfx";
import { newVfx, vfxWindow, defaultNode, type VfxLayer } from "@/lib/story/model";

// Panel de efectos (partículas) de una toma: lluvia, fuego, explosiones…
//
// Cada efecto es una capa con su sitio, su rato y sus propios ajustes. Los
// ajustes se sacan de la lista de VFX, así que añadir un efecto nuevo al motor
// lo hace aparecer aquí solo, sin tocar esta pantalla.
export function VfxEditor({
  vfx,
  dur,
  seleccionado,
  onChange,
  onSelect,
}: {
  vfx: VfxLayer[];
  dur: number;
  seleccionado: string | null;
  onChange: (v: VfxLayer[]) => void;
  onSelect: (id: string | null) => void;
}) {
  const [catalogo, setCatalogo] = useState(false);
  const [busca, setBusca] = useState("");
  const [cerrados, setCerrados] = useState<Partial<Record<VfxGroup, boolean>>>({});

  const upd = (id: string, patch: Partial<VfxLayer>) =>
    onChange(vfx.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const updParam = (id: string, key: string, valor: number) =>
    onChange(vfx.map((v) => (v.id === id ? { ...v, params: { ...v.params, [key]: valor } } : v)));

  function anadir(kind: VfxKind) {
    const nuevo = newVfx(kind);
    onChange([...vfx, nuevo]);
    onSelect(nuevo.id);
  }
  function duplicar(v: VfxLayer) {
    const copia = { ...v, id: nanoid(6), params: { ...v.params }, nodes: v.nodes.map((n) => ({ ...n })) };
    const i = vfx.findIndex((x) => x.id === v.id);
    const lista = [...vfx];
    lista.splice(i + 1, 0, copia);
    onChange(lista);
    onSelect(copia.id);
  }
  // Cambiar de efecto: los ajustes son otros, y la forma puede no valer para
  // el nuevo (una explosión no se dibuja a mano alzada).
  function cambiarTipo(v: VfxLayer, kind: VfxKind) {
    const spec = vfxSpec(kind);
    const forma = spec.shapes.includes(v.shape) ? v.shape : spec.shapes[0];
    upd(v.id, {
      kind, shape: forma,
      nodes: forma === v.shape ? v.nodes : (forma === "libre" ? [] : [defaultNode(forma)]),
      auto: forma === v.shape ? v.auto : true,
      params: vfxDefaults(kind),
      colorHex: spec.color ?? v.colorHex,
    });
  }
  // Al cambiar de forma se parte de un sitio razonable, salvo a mano alzada,
  // que empieza en blanco porque lo suyo es dibujarla.
  function cambiarForma(v: VfxLayer, shape: VfxShape) {
    if (shape === v.shape) return;
    upd(v.id, { shape, nodes: shape === "libre" ? [] : [defaultNode(shape)], auto: true });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Efectos (partículas)</span>
        <button onClick={() => setCatalogo((v) => !v)} className="btn-ghost ml-auto text-xs">
          <Plus className="h-3.5 w-3.5 text-accent" /> Añadir efecto
        </button>
      </div>

      {/* Catálogo: son muchos, así que van por secciones y con un buscador.
          Se pliega para no comerse el panel. */}
      {catalogo && (
        <div className="mt-2 rounded-lg border border-accent/40 bg-accent/5 p-2">
          <label className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              className="input py-1 text-xs"
              placeholder="Buscar un efecto (lluvia, fuego, neón…)"
              aria-label="Buscar un efecto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
            />
          </label>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {GRUPOS.map((g) => {
              const lista = VFX.filter((f) => f.group === g && coincide(f.label, busca));
              if (!lista.length) return null;
              const plegado = cerrados[g] && !busca;
              return (
                <div key={g} className="rounded border border-border/60">
                  <button
                    onClick={() => setCerrados((c) => ({ ...c, [g]: !c[g] }))}
                    className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] text-muted hover:bg-surface-2"
                  >
                    {plegado ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {GROUP_LABEL[g]}
                    <span className="ml-auto text-[10px] text-muted/70">{lista.length}</span>
                  </button>
                  {!plegado && (
                    <div className="flex flex-wrap gap-1 p-1.5 pt-0">
                      {lista.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => { anadir(f.id); setCatalogo(false); setBusca(""); }}
                          className="rounded-lg border border-border px-2 py-1 text-[11px] text-fg hover:border-accent hover:bg-accent/10"
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!VFX.some((f) => coincide(f.label, busca)) && (
              <p className="p-2 text-[11px] text-muted">Ningún efecto se llama así.</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 space-y-2">
        {vfx.map((v) => {
          const spec = vfxSpec(v.kind);
          const ventana = vfxWindow(v, dur);
          const abierto = seleccionado === v.id;
          return (
            <div
              key={v.id}
              className={`rounded-lg border ${abierto ? "border-accent bg-accent/10" : "border-border"}`}
            >
              <div
                onClick={() => onSelect(abierto ? null : v.id)}
                className="flex cursor-pointer flex-wrap items-center gap-2 px-2 py-1 text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span className="flex-1">{spec.label}</span>
                <span className="text-[11px] text-muted">
                  {v.timing === "all" ? "toda la toma" : `${ventana.start.toFixed(1)}–${ventana.end.toFixed(1)}s`}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicar(v); }}
                  className="text-muted hover:text-fg" title="Duplicar este efecto"
                ><Copy className="h-3.5 w-3.5" /></button>
                <button
                  onClick={(e) => { e.stopPropagation(); onChange(vfx.filter((x) => x.id !== v.id)); onSelect(null); }}
                  className="text-muted hover:text-danger" title="Quitar este efecto"
                ><Trash2 className="h-3.5 w-3.5" /></button>
              </div>

              {abierto && (
                <div className="space-y-2 border-t border-border/60 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-0.5 text-[11px]">
                      <span className="text-muted">Efecto</span>
                      <select
                        className="input py-0.5 text-xs"
                        value={v.kind}
                        onChange={(e) => cambiarTipo(v, e.target.value as VfxKind)}
                      >
                        {VFX.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </label>
                    {spec.color !== null ? (
                      <label className="space-y-0.5 text-[11px]">
                        <span className="text-muted">Color</span>
                        <input
                          type="color"
                          className="h-[34px] w-full cursor-pointer rounded-xl border border-border bg-surface-2"
                          value={v.colorHex}
                          onChange={(e) => upd(v.id, { colorHex: e.target.value })}
                        />
                      </label>
                    ) : (
                      <p className="self-end text-[10px] text-muted/80">
                        Este efecto trae sus propios colores.
                      </p>
                    )}
                  </div>

                  {/* Cuándo actúa */}
                  <div className="rounded-lg border border-border/60 p-2">
                    <label className="block space-y-0.5 text-[11px]">
                      <span className="text-muted">Cuándo se ve</span>
                      <select
                        className="input py-0.5 text-xs"
                        value={v.timing}
                        onChange={(e) => {
                          const t = e.target.value as VfxLayer["timing"];
                          upd(v.id, t === "range"
                            ? { timing: t, startSec: v.startSec || 0, endSec: Math.min(dur, (v.startSec || 0) + 2) }
                            : { timing: t });
                        }}
                      >
                        <option value="all">Toda la toma</option>
                        <option value="range">Solo un rato</option>
                      </select>
                    </label>
                    {v.timing === "range" && (
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <NumberInput
                          label="Empieza a los" value={v.startSec}
                          onChange={(n) => upd(v.id, { startSec: n, endSec: Math.max(n + 0.1, v.endSec) })}
                          min={0} max={Math.max(0.1, dur - 0.1)} step={0.2}
                        />
                        <NumberInput
                          label="Acaba a los" value={Math.min(v.endSec, dur)}
                          onChange={(n) => upd(v.id, { endSec: n })}
                          min={0.1} max={dur} step={0.2}
                        />
                      </div>
                    )}
                    <p className="mt-1 text-[10px] text-muted/80">
                      {spec.continuo
                        ? `No para mientras dure su rato (${ventana.start.toFixed(1)}s a ${ventana.end.toFixed(1)}s de los ${dur.toFixed(1)}s).`
                        : (v.params.every ?? 0) > 0
                          ? `Salta cada ${(v.params.every ?? 0).toFixed(1)}s más o menos, de los ${ventana.start.toFixed(1)}s a los ${ventana.end.toFixed(1)}s. El ritmo lleva algo de azar para que no suene a metrónomo.`
                          : `Es un golpe: salta a los ${ventana.start.toFixed(1)}s y se apaga solo. Sube «cada cuántos segundos se repite» para que no pare.`}
                    </p>
                  </div>

                  {/* Dónde: la forma y los sitios. Se dibujan encima de la
                      previsualización, que es lo cómodo; aquí solo se listan
                      para poder borrarlos y ver cuántos hay. */}
                  <div className="rounded-lg border border-border/60 p-2">
                    <label className="block space-y-0.5 text-[11px]">
                      <span className="text-muted">Cómo se coloca</span>
                      <select
                        className="input py-0.5 text-xs"
                        value={v.shape}
                        onChange={(e) => cambiarForma(v, e.target.value as VfxShape)}
                      >
                        {spec.shapes.map((f) => (
                          <option key={f} value={f}>{SHAPE_LABEL[f]}</option>
                        ))}
                      </select>
                    </label>
                    <p className="mt-1 text-[10px] text-muted/80">
                      {v.shape === "arriba"
                        ? "Entra por todo lo alto del cuadro, como si cayera del cielo."
                        : v.shape === "punto"
                          ? "Toca la previsualización para ir poniendo sitios. Puedes poner varios."
                          : v.shape === "linea" || v.shape === "libre"
                            ? "Arrastra sobre la previsualización para trazar una línea. El efecto sale uniforme a lo largo. Puedes trazar varias; al salir de «Colocando» la guía desaparece."
                            : "Dibuja sobre la previsualización con el dedo o el ratón."}
                    </p>
                    {/* Pegado a la imagen: si la toma se mueve o se acerca, el
                        efecto va con ella. Sin esto una hoguera se queda
                        flotando y un chorro sale del aire. */}
                    {v.shape !== "arriba" && (
                      <label className="mt-1.5 flex items-start gap-2 text-[11px]">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={v.follow}
                          onChange={(e) => upd(v.id, { follow: e.target.checked })}
                        />
                        <span>
                          <span className="text-fg">Se mueve con la toma</span>
                          <span className="block text-[10px] text-muted/80">
                            Queda pegado a la imagen: si la cámara se desplaza o se acerca, el
                            efecto la acompaña en vez de quedarse clavado en el cuadro.
                          </span>
                        </span>
                      </label>
                    )}
                    {v.shape !== "arriba" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted">
                          {v.nodes.length === 0
                            ? "Todavía no has puesto ninguno"
                            : `${v.nodes.length} ${v.nodes.length === 1 ? "sitio" : "sitios"}`}
                        </span>
                        {v.nodes.length > 0 && (
                          <button
                            onClick={() => upd(v.id, { nodes: v.nodes.slice(0, -1), auto: false })}
                            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2"
                          >
                            Deshacer el último
                          </button>
                        )}
                        {v.nodes.length > 0 && (
                          <button
                            onClick={() => upd(v.id, { nodes: [], auto: false })}
                            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface-2"
                          >
                            Quitar todos
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Ajustes propios del efecto */}
                  <div className="rounded-lg border border-accent/40 p-2">
                    <span className="text-[11px] text-muted">Ajustes</span>
                    {spec.params.map((p) => {
                      // Solo 0/1 con paso 1 es interruptor. «Cuántos rayos» (1–12)
                      // también tiene step 1, pero es un número, no un checkbox.
                      const interruptor = p.step === 1 && p.min === 0 && p.max === 1;
                      return interruptor ? (
                        <label key={p.key} className="mt-1 flex items-center gap-2 text-[11px]">
                          <input
                            type="checkbox"
                            checked={!!v.params[p.key]}
                            onChange={(e) => updParam(v.id, p.key, e.target.checked ? 1 : 0)}
                          />
                          <span className="text-muted">{p.label}</span>
                        </label>
                      ) : (
                        <Slider
                          key={p.key} label={p.label}
                          value={v.params[p.key] ?? 1}
                          min={p.min} max={p.max} step={p.step}
                          onChange={(n) => updParam(v.id, p.key, n)}
                          format={(n) => (p.step === 1 ? String(Math.round(n)) : n.toFixed(2))}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!vfx.length && (
          <p className="text-[11px] text-muted">
            Lluvia, fuego, explosiones, rayos… se dibujan dentro del video, no encima con un GIF.
          </p>
        )}
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const GRUPOS: VfxGroup[] = ["golpes", "fuego", "clima", "ambiente", "luces"];
// Buscar sin pelearse con tildes ni mayúsculas: "neon" encuentra "Neón".
const limpia = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const coincide = (label: string, q: string) => !q.trim() || limpia(label).includes(limpia(q));
