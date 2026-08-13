"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download, Copy, Check, AlertTriangle, Eye, EyeOff, Package, Image as ImageIcon,
  Hand, MousePointer2, Undo2, Sparkles, Loader2,
} from "lucide-react";
import { revisar, pegas, nombreArchivo, type Escena } from "@/lib/lab/escena";
import { aBlob, bajar, lienzoDeCapas, promptIa, zipDeCapas } from "@/lib/lab/exportar";
import { pedirJson, mensajeLegible } from "@/lib/pedir-json";
import { borrarBorradorMapa, guardarBorradorMapa, leerBorradorMapa } from "@/lib/lab/borrador-mapa";
import type { Golpe } from "@/lib/lab/geometria-mapa";
import { RangoPreciso } from "./rango-preciso";
import { LienzoMapa } from "./lienzo-mapa";
import { InspectorForma } from "./inspector-forma";
import {
  SEMANTICAS, anadirCapa, anadirForma, formaNueva, puestoDe, recorrerFormas,
} from "@/lib/lab/edicion-mapa";

// El mapa de la escena: verlo, ajustarlo y no perderlo.
//
// QUÉ CAMBIÓ Y POR QUÉ. Esto arrancaba con un ejemplo cargado —«un bosque con
// un portal»— y no guardaba nada. Las dos cosas juntas hacían lo peor que puede
// hacer un editor: al volver a entrar, tu trabajo no estaba Y en su sitio había
// una escena ajena, así que ni siquiera parecía una pérdida. Se han quitado los
// ejemplos enteros y ahora se autoguarda en el navegador.
//
// Un ejemplo, además, aquí no enseña nada: lo que hay que aprender es a
// describir TU escena, y para eso el camino es escribir el prompt y ver qué
// sale. Eso es el paso 1, y lo hace la IA con tus palabras.
//
// Y el mapa ya no es solo una imagen: se coge una forma con el dedo, se
// arrastra, se estira por las esquinas, se duplica y se borra. El JSON sigue
// abajo para quien quiera afinar, pero ha dejado de ser la única puerta.

/** Un respiro antes de autoguardar, para no escribir en IndexedDB en cada tecla. */
const ESPERA_GUARDADO = 1200;

export function MapaEditor({
  onEnviarAlCompositor,
  onEscena,
  escenaExterna,
  puedeIa,
}: {
  onEnviarAlCompositor?: (esc: Escena) => void;
  /** Para que quien nos aloja sepa qué mapa hay cargado. */
  onEscena?: (esc: Escena) => void;
  /** Un mapa que llega de fuera (lo escribió la IA): sustituye al de aquí. */
  escenaExterna?: Escena | null;
  /** Hay clave de OpenAI: se puede pedir un retoque del mapa. */
  puedeIa?: boolean;
}) {
  // Arranca VACÍO. Nada de ejemplos.
  const [texto, setTexto] = useState("");
  const [esc, setEsc] = useState<Escena | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [etiquetas, setEtiquetas] = useState(true);
  const [rejilla, setRejilla] = useState(false);
  const [paralaje, setParalaje] = useState(true);
  const [fuerza, setFuerza] = useState(60);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [editando, setEditando] = useState(true);
  /** Nada se puede coger. Para no descolocar algo sin querer al desplazarse. */
  const [bloqueado, setBloqueado] = useState(false);
  /** Si hay una, solo esa capa se ve y se toca. */
  const [aislada, setAislada] = useState<string | null>(null);
  const [capasAbiertas, setCapasAbiertas] = useState(true);
  const [formaNuevaEn, setFormaNuevaEn] = useState<string>("prop");
  const [seleccion, setSeleccion] = useState<Golpe | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [instruccion, setInstruccion] = useState("");
  const [retocando, setRetocando] = useState(false);
  /** El estado anterior al último cambio grande: un retoque de IA, un «Aplicar». */
  const [anterior, setAnterior] = useState<Escena | null>(null);
  /** Hasta que no se ha leído el borrador, no se escribe: se borraría al leerlo. */
  const [listoParaGuardar, setListoParaGuardar] = useState(false);

  const escId = esc?.scene.id;
  const numCapas = esc?.layers.length ?? 0;
  // Al cargar una escena nueva se marcan todas: lo normal es querer todas. No
  // depende de `esc` entero: con el objeto, cada arrastre de una forma volvería
  // a marcarlas y se perdería lo que el usuario hubiera desmarcado.
  useEffect(() => {
    setMarcadas(esc ? esc.layers.map((c) => c.id) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escId, numCapas]);
  useEffect(() => { if (esc) onEscena?.(esc); }, [esc]);

  // Lo que había cuando te fuiste. Se repone solo, sin preguntar: es TU mapa y
  // no hay nada con lo que pueda confundirse —el compositor sí pregunta, porque
  // allí puede llegar un montaje nuevo desde otra pestaña—.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const b = await leerBorradorMapa();
        if (!vivo || !b?.texto) return;
        setTexto(b.texto);
        const r = revisar(b.escena ?? JSON.parse(b.texto));
        if ("escena" in r) {
          setEsc(r.escena);
          setAviso(
            `Recuperado lo que tenías · guardado a las ${new Date(b.guardadoEn).toLocaleTimeString("es-MX")}.`,
          );
        }
      } catch {
        // Un borrador ilegible no puede impedir empezar de cero.
      } finally {
        if (vivo) setListoParaGuardar(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!listoParaGuardar || !texto.trim()) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await guardarBorradorMapa({
            version: 1, guardadoEn: Date.now(), texto, escena: esc ?? undefined,
          });
          setGuardado(new Date().toLocaleTimeString("es-MX"));
        } catch {
          setGuardado(null);
        }
      })();
    }, ESPERA_GUARDADO);
    return () => window.clearTimeout(t);
  }, [texto, esc, listoParaGuardar]);

  // Un mapa escrito por la IA entra aquí como si lo hubiera pegado el usuario:
  // se ve, se puede corregir a mano y se dibuja desde el mismo sitio.
  useEffect(() => {
    if (!escenaExterna) return;
    setAnterior(esc);
    setTexto(JSON.stringify(escenaExterna, null, 2));
    setEsc(escenaExterna);
    setError(null);
    setSeleccion(null);
    setAviso(`Mapa de la IA: ${escenaExterna.layers.length} capas. Ya puedes moverlo a mano.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escenaExterna]);

  /** Cambiar la escena desde el lienzo o el inspector, y reflejarlo en el JSON. */
  function ponerEscena(next: Escena) {
    setEsc(next);
    setTexto(JSON.stringify(next, null, 2));
  }

  function aplicar(fuente?: string) {
    try {
      const data = JSON.parse(fuente ?? texto);
      const r = revisar(data);
      if ("error" in r) { setError(r.error); setAviso(null); return; }
      setAnterior(esc);
      setEsc(r.escena); setError(null); setSeleccion(null);
      setAviso(`Cargado: ${r.escena.layers.length} capas, ${r.escena.layers.reduce((a, c) => a + c.objects.length, 0)} formas.`);
    } catch (e) {
      setError(`El JSON no se puede leer: ${(e as Error).message}`);
      setAviso(null);
    }
  }

  /**
   * Pedirle a la IA un cambio CONCRETO sobre el mapa que ya hay.
   *
   * Es distinto de generar: generar tira lo que tienes y te da otra escena, así
   * que el ajuste que llevabas media hora afinando se pierde. Aquí va el mapa
   * actual, vuelve el mismo mapa con el cambio pedido, y queda «Deshacer» por
   * si no era lo que se quería.
   */
  async function retocarConIa() {
    if (!esc || !instruccion.trim() || retocando) return;
    setRetocando(true);
    setError(null);
    try {
      const j = await pedirJson("/api/story/ia/lab/retoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruccion: instruccion.trim(), base: esc }),
      });
      const r = revisar(j.escena);
      if ("error" in r) throw new Error(r.error);
      setAnterior(esc);
      setEsc(r.escena);
      setTexto(JSON.stringify(r.escena, null, 2));
      setSeleccion(null);
      setInstruccion("");
      // Se cuenta lo que cambió de VERDAD. Un modelo que contesta «listo» y
      // devuelve el mapa igual, y otro que rehace media escena con tres
      // palabras, se ven idénticos desde fuera si solo se dice «retocado».
      const c = j.cambios as { anadidas: number; quitadas: number; movidas: number } | undefined;
      const partes = c
        ? [
            c.movidas ? `${c.movidas} cambiada${c.movidas === 1 ? "" : "s"}` : "",
            c.anadidas ? `${c.anadidas} nueva${c.anadidas === 1 ? "" : "s"}` : "",
            c.quitadas ? `${c.quitadas} quitada${c.quitadas === 1 ? "" : "s"}` : "",
          ].filter(Boolean)
        : [];
      setAviso(
        partes.length
          ? `Retocado · ${partes.join(", ")}. Si no era eso, «Deshacer».`
          : "La IA devolvió el mapa sin cambios. Prueba a pedírselo con otras palabras.",
      );
    } catch (e) {
      setError(mensajeLegible(e, "No se pudo retocar el mapa."));
    } finally {
      setRetocando(false);
    }
  }

  function empezarDeCero() {
    setAnterior(esc);
    setTexto(""); setEsc(null); setSeleccion(null); setError(null);
    setAviso("Mapa vacío. Genera uno con IA desde el paso 1, o pega un JSON aquí abajo.");
    void borrarBorradorMapa();
    setGuardado(null);
  }

  function deshacer() {
    const a = anterior;
    setAnterior(null);
    setSeleccion(null);
    if (a) ponerEscena(a);
    else { setEsc(null); setTexto(""); }
    setAviso("Deshecho.");
  }

  const total = useMemo(
    () => esc?.layers.reduce((a, c) => a + c.objects.length, 0) ?? 0, [esc]);
  const lista = useMemo(() => (esc ? pegas(esc) : []), [esc]);

  async function exportar(modo: "png" | "zip", ids: string[]) {
    if (!esc) return;
    if (!ids.length) { setError("No hay ninguna capa marcada."); return; }
    setTrabajando(true);
    try {
      if (modo === "png") {
        const b = await aBlob(lienzoDeCapas(esc, ids, ids.length < esc.layers.length, etiquetas));
        bajar(b, `${nombreArchivo(esc.scene.id)}--mapa.png`);
        setAviso(`PNG de ${ids.length} capa${ids.length > 1 ? "s" : ""} descargado.`);
      } else {
        const b = await zipDeCapas(esc, ids, etiquetas);
        bajar(b, `${nombreArchivo(esc.scene.id)}--capas.zip`);
        setAviso(`ZIP con ${ids.length} PNG, las instrucciones y el JSON.`);
      }
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setTrabajando(false); }
  }

  async function copiarPrompt() {
    if (!esc) return;
    const t = promptIa(esc, marcadas.length ? marcadas : undefined);
    try {
      await navigator.clipboard.writeText(t);
      setAviso("Instrucciones copiadas. Pégalas junto con los PNG.");
    } catch {
      // Sin permiso de portapapeles: se deja el texto a la vista para copiarlo
      // a mano, en vez de decir «no se pudo» y dejar al usuario sin nada.
      setTexto(t);
      setAviso("No se pudo copiar solo: el texto está abajo, cópialo a mano.");
    }
  }

  const alterna = (id: string) =>
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const cuadroJson = (
    <CuadroJson
      texto={texto}
      setTexto={setTexto}
      onAplicar={() => aplicar()}
      esc={esc}
      onOrdenar={() => {
        try { setTexto(JSON.stringify(JSON.parse(texto), null, 2)); setError(null); }
        catch (e) { setError((e as Error).message); }
      }}
    />
  );

  // ── Sin mapa todavía ──────────────────────────────────────────────────────
  if (!esc) {
    return (
      <div className="space-y-3">
        <VacioConPasos onImportar={(s) => { setTexto(s); aplicar(s); }} />
        {cuadroJson}
        {error && (
          <p className="flex items-start gap-1.5 text-[11px] text-danger">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
        {!error && aviso && <p className="text-[11px] text-accent">{aviso}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip min-w-0 max-w-full truncate bg-surface-2 text-muted">
          {esc.scene.title || esc.scene.id} · {esc.layers.length} capas · {total} formas
        </span>
        {guardado && (
          <span className="text-[10px] text-muted">Guardado aquí a las {guardado}</span>
        )}
        <span className="flex-1" />
        {anterior && (
          <button onClick={deshacer} className="btn-ghost text-xs">
            <Undo2 className="h-3.5 w-3.5 text-accent" /> Deshacer
          </button>
        )}
        <label className="btn-ghost cursor-pointer text-xs">
          <Package className="h-3.5 w-3.5 text-accent" /> Importar JSON
          <input
            type="file" accept=".json,application/json" className="hidden"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => { const s = String(r.result); setTexto(s); aplicar(s); };
              r.readAsText(f);
              ev.target.value = "";
            }}
          />
        </label>
        <button onClick={empezarDeCero} className="btn-ghost text-xs">Empezar de cero</button>
        <button onClick={copiarPrompt} className="btn-ghost text-xs">
          <Copy className="h-3.5 w-3.5 text-accent" /> Copiar instrucciones para la IA
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* Capas */}
        <div className="card min-w-0 space-y-2 p-3">
          {/* La cabecera de capas ES el interruptor: plegada, esta columna deja
              de comerse la pantalla y el lienzo queda a la vista, que es donde
              se trabaja. */}
          <button
            type="button"
            onClick={() => setCapasAbiertas((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={capasAbiertas}
          >
            <span className="label">Capas</span>
            <span className="chip ml-auto bg-surface-2 text-muted">{esc.layers.length} · {total} formas</span>
            <span className="text-muted">{capasAbiertas ? "▾" : "▸"}</span>
          </button>

          {/* Aislar una capa: se ve sola Y es la única que se puede tocar. Ver
              sola sin lo segundo no servía de nada, porque el dedo seguía
              agarrando formas de las capas de encima. */}
          <label className="flex items-center gap-2 text-[11px] text-muted">
            Trabajar en
            <select
              className="input min-w-0 flex-1 py-1 text-[11px]"
              value={aislada ?? ""}
              onChange={(e) => setAislada(e.target.value || null)}
              aria-label="Capa aislada"
            >
              <option value="">Todas las capas</option>
              {esc.layers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          {capasAbiertas && (<>
          <p className="text-[11px] text-muted">
            De atrás hacia delante. El número es la profundidad: 0 no se mueve, 1 se mueve entero.
          </p>
          <div className="space-y-1.5">
            {esc.layers.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-surface-2/50 p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox" checked={marcadas.includes(c.id)}
                    onChange={() => alterna(c.id)} aria-label={`Marcar ${c.name}`}
                  />
                  <input
                    className="input min-w-0 flex-1 py-0.5 text-[11px] font-medium"
                    value={c.name}
                    onChange={(e) => ponerEscena({
                      ...esc,
                      layers: esc.layers.map((x) => x.id === c.id ? { ...x, name: e.target.value.slice(0, 80) } : x),
                    })}
                    aria-label={`Nombre de ${c.id}`}
                  />
                  <span className="chip shrink-0 bg-brand/15 text-brand">{c.depth}</span>
                  <button
                    onClick={() => ponerEscena({
                      ...esc,
                      layers: esc.layers.map((x) => x.id === c.id ? { ...x, visible: x.visible === false } : x),
                    })}
                    className="shrink-0 text-muted hover:text-fg"
                    title={c.visible === false ? "Mostrar" : "Ocultar"}
                  >
                    {c.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <textarea
                  className="input mt-1 min-h-[2.5rem] w-full py-0.5 text-[10px]"
                  placeholder="Prompt de esta capa (inglés)…"
                  value={c.ai?.prompt ?? ""}
                  onChange={(e) => ponerEscena({
                    ...esc,
                    layers: esc.layers.map((x) => x.id === c.id
                      ? { ...x, ai: { ...x.ai, prompt: e.target.value.slice(0, 4000) } }
                      : x),
                  })}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setMarcadas(esc.layers.map((c) => c.id))} className="btn-ghost flex-1 text-[11px]">Todas</button>
            <button onClick={() => setMarcadas([])} className="btn-ghost flex-1 text-[11px]">Ninguna</button>
          </div>
          {/* Crear a mano, sin pasar por la IA. Va delante de todas porque la
              primera capa es el fondo y meter una nueva ahí taparía la escena. */}
          <button
            onClick={() => {
              const { escena, capaId } = anadirCapa(esc);
              ponerEscena(escena);
              setAislada(capaId);
              setAviso("Capa nueva, delante de todas y ya aislada. Añádele formas abajo.");
            }}
            className="btn-ghost w-full text-[11px]"
          >
            + Capa nueva
          </button>
          </>)}
          <div className="space-y-1.5 border-t border-border pt-2">
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <input type="checkbox" checked={etiquetas} onChange={(e) => setEtiquetas(e.target.checked)} />
              Incluir etiquetas en el PNG
            </label>
            <button onClick={() => exportar("zip", marcadas)} disabled={trabajando} className="btn-ghost w-full text-xs">
              <Download className="h-3.5 w-3.5 text-accent" /> Guías de color · ZIP
            </button>
            {/* Este ZIP se confundía con el del proyecto: alguien exportaba
                desde aquí, importaba, y le volvían las formas de colores en vez
                de sus imágenes. El texto dice qué lleva y dónde está el otro. */}
            <p className="text-[10px] leading-tight text-muted">
              Son los mapas de colores para dárselos a una IA de fuera, no tu
              trabajo. Para guardar y recuperar el proyecto entero —imágenes,
              mapa y cámara— usa <b className="text-fg">Descargar todo</b> en
              «Montaje y paralaje», y reábrelo allí con <b className="text-fg">Importar todo</b>.
            </p>
            <button onClick={() => exportar("png", marcadas)} disabled={trabajando} className="btn-ghost w-full text-xs">
              <ImageIcon className="h-3.5 w-3.5 text-accent" /> Marcadas en un PNG
            </button>
            {onEnviarAlCompositor && (
              <button onClick={() => onEnviarAlCompositor(esc)} className="btn-ghost w-full text-xs">
                <Check className="h-3.5 w-3.5 text-accent" /> Probar el paralaje con el mapa
              </button>
            )}
          </div>
        </div>

        {/* Vista */}
        <div className="card min-w-0 space-y-2 p-3">
          {/* Los dos modos, y bien grandes: es lo que decide si el lienzo
              responde al dedo o solo se mira. */}
          <div className="flex gap-1" role="tablist" aria-label="Qué hace el lienzo">
            <button
              role="tab" aria-selected={editando}
              onClick={() => setEditando(true)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] ${
                editando ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              <MousePointer2 className="h-3.5 w-3.5" /> Mover formas
            </button>
            <button
              role="tab" aria-selected={!editando}
              onClick={() => { setEditando(false); setSeleccion(null); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] ${
                !editando ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              <Hand className="h-3.5 w-3.5" /> Ver el paralaje
            </button>
          </div>
          <p className="text-[10px] leading-snug text-muted">
            {editando
              ? "Toca una forma para cogerla, arrástrala para moverla y tira de una esquina para estirarla. El paralaje se congela mientras tanto: no se puede agarrar algo que se mueve solo."
              : "Las capas se desplazan a distinta velocidad según su profundidad. Eso, y solo eso, es el paralaje."}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <input type="checkbox" checked={paralaje} disabled={editando}
                onChange={(e) => setParalaje(e.target.checked)} /> Paralaje
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <input type="checkbox" checked={rejilla} onChange={(e) => setRejilla(e.target.checked)} /> Rejilla y tercios
            </label>
            <label className="flex min-w-[170px] flex-1 items-center gap-2 text-[11px] text-muted">
              Fuerza
              <RangoPreciso valor={fuerza} min={0} max={100} paso={1}
                onCambio={setFuerza} etiqueta="fuerza" disabled={editando} />
              <span className="w-8 tabular-nums">{fuerza}%</span>
            </label>
            <span className="chip bg-surface-2 text-muted">{esc.scene.width}×{esc.scene.height}</span>
          </div>

          <LienzoMapa
            esc={esc}
            seleccion={seleccion}
            onSeleccion={setSeleccion}
            onEscena={ponerEscena}
            editando={editando}
            etiquetas={etiquetas}
            rejilla={rejilla}
            paralaje={paralaje}
            fuerza={fuerza}
            bloqueado={bloqueado}
            capaAislada={aislada}
          />

          {/* LA FORMA COGIDA, JUSTO DEBAJO DEL LIENZO.
              Estaba arriba del todo, en la columna de al lado: para mover una
              forma había que mirar a un sitio y tocar en otro, y en el móvil ni
              siquiera se veían a la vez. Aquí está donde se usa. */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-2/40 p-1.5">
            <button
              onClick={() => setBloqueado((v) => !v)}
              className={`btn-ghost text-[11px] ${bloqueado ? "border-gold text-gold" : ""}`}
              title="Con el lienzo bloqueado no se puede coger ni mover nada"
            >
              {bloqueado ? "🔒 Bloqueado" : "🔓 Libre"}
            </button>
            {/* Recorrer las formas una a una: con dieciocho amontonadas, cazar
                la de detrás con el dedo es imposible porque siempre coge la de
                delante. */}
            <button
              onClick={() => setSeleccion(recorrerFormas(esc, seleccion, -1))}
              disabled={!total}
              className="btn-ghost px-2 text-[11px] disabled:opacity-40"
              aria-label="Forma anterior"
            >
              ‹ Anterior
            </button>
            <span className="text-[10px] tabular-nums text-muted">
              {puestoDe(esc, seleccion).i} de {total}
            </span>
            <button
              onClick={() => setSeleccion(recorrerFormas(esc, seleccion, 1))}
              disabled={!total}
              className="btn-ghost px-2 text-[11px] disabled:opacity-40"
              aria-label="Forma siguiente"
            >
              Siguiente ›
            </button>
            <span className="flex-1" />
            <select
              className="input w-auto min-w-0 py-1 text-[11px]"
              value={formaNuevaEn}
              onChange={(e) => setFormaNuevaEn(e.target.value)}
              aria-label="Qué forma añadir"
            >
              {SEMANTICAS.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
            <button
              onClick={() => {
                const capaId = aislada ?? esc.layers[esc.layers.length - 1]?.id;
                if (!capaId) { setAviso("Primero crea una capa."); return; }
                const o = formaNueva(esc, formaNuevaEn);
                ponerEscena(anadirForma(esc, capaId, o));
                setSeleccion({ capaId, objetoId: o.id });
                setAviso(`Forma añadida en «${esc.layers.find((c) => c.id === capaId)?.name}». Arrástrala a su sitio.`);
              }}
              className="btn-brand px-2 text-[11px]"
              title={aislada ? "Se añade a la capa aislada" : "Se añade a la capa de delante"}
            >
              + Añadir
            </button>
          </div>

          {seleccion && (
            <InspectorForma
              esc={esc} seleccion={seleccion}
              onEscena={ponerEscena} onSeleccion={setSeleccion}
            />
          )}

          {puedeIa && (
            <div className="space-y-1 rounded-lg border border-brand/40 bg-brand/5 p-2">
              <p className="text-[11px] font-medium">Pídele un cambio a la IA, sin rehacer la escena</p>
              <div className="flex gap-1">
                <input
                  className="input min-w-0 flex-1 py-1 text-[11px]"
                  placeholder="mueve el portal a la izquierda y quita los árboles del fondo"
                  value={instruccion}
                  onChange={(e) => setInstruccion(e.target.value.slice(0, 400))}
                  onKeyDown={(e) => { if (e.key === "Enter") void retocarConIa(); }}
                  disabled={retocando}
                  aria-label="Qué cambiar del mapa"
                />
                <button
                  onClick={() => void retocarConIa()}
                  disabled={retocando || !instruccion.trim()}
                  className="btn-brand shrink-0 px-3 text-xs"
                >
                  {retocando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Retocar
                </button>
              </div>
              <p className="text-[10px] text-muted">
                Trabaja sobre el mapa que ya tienes: conserva lo demás, y queda «Deshacer».
              </p>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-[11px] text-danger">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
          {!error && aviso && <p className="text-[11px] text-accent">{aviso}</p>}
          {/* Pegas que no rompen el JSON pero sí el resultado. */}
          {lista.map((p, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] text-gold">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {p}
            </p>
          ))}
        </div>
      </div>

      {cuadroJson}
    </div>
  );
}

/**
 * Lo que se ve cuando todavía no hay mapa.
 *
 * Antes aquí había un ejemplo cargado. Un ejemplo responde a «¿qué es esto?»
 * pero no a «¿qué hago yo ahora?», y encima ocupaba el sitio donde debía estar
 * el trabajo de la persona. Los pasos sí contestan a lo segundo.
 */
function VacioConPasos({ onImportar }: { onImportar: (json: string) => void }) {
  const pasos = [
    {
      n: 1,
      t: "Genera el escenario con tu prompt",
      d: "Describe la escena con tus palabras en el panel de IA de arriba. Ella la parte en capas —cielo, fondo, primer plano— y escribe el mapa.",
    },
    {
      n: 2,
      t: "Ajusta y modifica las animaciones",
      d: "Aquí coges cualquier forma con el dedo para moverla, la estiras por las esquinas, la duplicas o la borras. O le pides a la IA un cambio concreto sin rehacer nada.",
    },
    {
      n: 3,
      t: "Monta y anima",
      d: "Pasa al montaje: profundidades, cámara, actores con sus rutas y efectos. Todo se guarda solo en este navegador mientras trabajas.",
    },
  ];
  return (
    <div className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-bold">Todavía no hay mapa</h2>
        <p className="mt-1 text-[11px] text-muted">
          No se carga ningún ejemplo, a propósito: este sitio es para tu escena, y lo que aparezca
          aquí debe ser tuyo. En cuanto haya un mapa se guarda solo, y sigue estando al volver.
        </p>
      </div>
      <ol className="space-y-2">
        {pasos.map((p) => (
          <li key={p.n} className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/60 bg-accent/10 text-[11px] font-bold text-accent">
              {p.n}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-medium">{p.t}</p>
              <p className="text-[11px] leading-snug text-muted">{p.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <label className="btn-ghost w-fit cursor-pointer text-xs">
        <Package className="h-3.5 w-3.5 text-accent" /> …o importa un JSON que ya tengas
        <input
          type="file" accept=".json,application/json" className="hidden"
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => onImportar(String(r.result));
            r.readAsText(f);
            ev.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function CuadroJson({ texto, setTexto, onAplicar, onOrdenar, esc }: {
  texto: string;
  setTexto: (s: string) => void;
  onAplicar: () => void;
  onOrdenar: () => void;
  esc: Escena | null;
}) {
  return (
    <details className="card p-3" open={!esc}>
      <summary className="cursor-pointer text-xs font-medium text-muted">
        JSON de la escena · para afinar a mano o pegar uno de fuera
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1" />
          <button onClick={onAplicar} className="btn-brand text-xs">Aplicar</button>
          <button onClick={onOrdenar} className="btn-ghost text-xs">Ordenar</button>
          {esc && (
            <button
              onClick={() => bajar(
                new Blob([JSON.stringify(esc, null, 2)], { type: "application/json" }),
                `${nombreArchivo(esc.scene.id)}.json`,
              )}
              className="btn-ghost text-xs"
            ><Download className="h-3.5 w-3.5 text-accent" /> Descargar</button>
          )}
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          spellCheck={false}
          placeholder="Pega aquí el JSON de un mapa, o genera uno con IA arriba."
          className="input h-64 w-full resize-y font-mono text-[11px] leading-relaxed"
          aria-label="JSON de la escena"
        />
      </div>
    </details>
  );
}
