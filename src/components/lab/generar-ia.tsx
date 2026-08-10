"use client";

import { useState } from "react";
import { pedirJsonCrudo } from "@/lib/pedir-json";
import { Wand2, Loader2, AlertTriangle, Check, Sparkles } from "lucide-react";
import type { Escena } from "@/lib/lab/escena";
import { revisar, esGuia } from "@/lib/lab/escena";
import { lienzoDeCapas } from "@/lib/lab/exportar";
import { prepararCapa, type Recorte } from "@/lib/lab/quitar-fondo";
import type { SpritePlaneado } from "@/lib/lab/plan-escena-viva";
import { resolverSpritePlaneado, type SpriteMontado } from "@/lib/lab/sprite-automatico";
import { normalizarEfectos, type EfectoEscena } from "@/lib/lab/efectos-escena";

// Del texto a la escena montada, sin salir de aquí.
//
// Dos llamadas distintas y en este orden a propósito: primero el mapa (texto),
// que es barato y se puede corregir a mano; después una imagen por capa, que es
// lo que cuesta. Así, si el mapa sale torcido, se arregla antes de gastar en
// dibujarlo cinco veces.

export interface CapaGenerada {
  id: string;
  nombre: string;
  url: string;
  via: Recorte["via"];
  vacio: number;
  color?: string;
  /** El movimiento propio que la IA le puso a esta capa, si le puso alguno. */
  mov?: unknown;
  /** Profundidad decidida en el mapa; no debe perderse al montar. */
  depth: number;
}

export function GenerarIa({
  escena,
  onEscena,
  onAnimacion,
  onEfectos,
  onCapas,
}: {
  /** El mapa que hay ahora, para poder dibujar capa a capa. */
  escena: Escena | null;
  onEscena: (e: Escena) => void;
  /**
   * La animación que escribió la IA, ya traducida a la cola del motor. Llega
   * junto al mapa porque se piden en la misma llamada: la cámara se decide
   * mirando las capas que se acaban de crear, no después.
   */
  onAnimacion?: (pasos: any[], avisos: string[]) => void;
  /** Los efectos del motor que escribió la IA, ya validados contra el catálogo. */
  onEfectos?: (efectos: EfectoEscena[], avisos: string[]) => void;
  /** El resumen viaja con las capas: esta tarjeta se cierra al montarlas. */
  onCapas: (c: CapaGenerada[], resumen: string, sprites: SpriteMontado[]) => void;
}) {
  const [idea, setIdea] = useState("");
  const [formato, setFormato] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [nCapas, setNCapas] = useState(4);
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hechas, setHechas] = useState<CapaGenerada[]>([]);
  const [sprites, setSprites] = useState<SpritePlaneado[]>([]);
  const [trabajando, setTrabajando] = useState(false);

  async function pedirMapa() {
    setError(null); setSprites([]); setTrabajando(true);
    setPaso("Dirigiendo el mapa, los actores y sus rutas…");
    try {
      const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/escena", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, formato, capas: nCapas, viva: true }),
      });
      if (!r.ok) {
        // Con 422 viene también lo que contestó: se carga igual para poder
        // arreglarlo a mano en vez de perder la respuesta.
        if (j.bruto) {
          const rev = revisar(j.bruto);
          if ("escena" in rev) onEscena(rev.escena);
        }
        throw new Error(j.error ?? "No se pudo");
      }
      onEscena(j.escena);
      const planeados = Array.isArray(j.sprites) ? j.sprites as SpritePlaneado[] : [];
      setSprites(planeados);
      if (Array.isArray(j.animacion) && j.animacion.length) {
        onAnimacion?.(j.animacion, Array.isArray(j.avisos) ? j.avisos : []);
      }
      // Los efectos. La ruta los venía devolviendo desde hace tres versiones y
      // aquí no se leían: se pagaba el token de pedirlos y se tiraban.
      const fx = normalizarEfectos(j.efectos);
      if (fx.efectos.length || fx.avisos.length) onEfectos?.(fx.efectos, fx.avisos);
      const conFx = fx.efectos.length
        ? `, ${fx.efectos.length} ${fx.efectos.length === 1 ? "efecto" : "efectos"}`
        : "";
      const conAnim = Array.isArray(j.animacion) && j.animacion.length
        ? ` y ${j.animacion.length} ${j.animacion.length === 1 ? "paso de cámara" : "pasos de cámara"}`
        : "";
      const conSprites = planeados.length
        ? `, ${planeados.length} ${planeados.length === 1 ? "actor animado" : "actores animados"}`
        : ", sin actores animados";
      setPaso(`Mapa listo: ${j.escena.layers.length} capas${conSprites}${conFx}${conAnim}. Revísalo y genera el montaje.`);
      // Lo que se tuvo que enderezar se enseña: si la IA pidió algo imposible
      // —dos movimientos del mismo eje, una capa que no existe— hay que poder
      // corregir el encargo en vez de preguntarse por qué se ve raro.
      if (Array.isArray(j.avisos) && j.avisos.length) setError(j.avisos.join(" · "));
    } catch (e) { setError((e as Error).message); setPaso(null); }
    finally { setTrabajando(false); }
  }

  async function dibujar() {
    if (!escena) return;
    setError(null); setHechas([]); setTrabajando(true);
    // Las capas de reserva NO se mandan: son una guía de dónde va el personaje
    // y los efectos, y el modelo devolvería un PNG vacío que se paga igual.
    const visibles = escena.layers.filter((c) => c.visible !== false && !esGuia(c));
    const guias = escena.layers.filter((c) => c.visible !== false && esGuia(c)).length;
    const out: CapaGenerada[] = [];
    // Una capa que falle NO tumba el lote. Antes se cortaba en la primera y las
    // siguientes ni se intentaban: pagabas media escena y te quedabas sin nada
    // que montar. Ahora se sigue y al final se dice cuáles fallaron.
    const fallos: string[] = [];
    const actores: SpriteMontado[] = [];
    const avisosActores: string[] = [];
    try {
      for (let i = 0; i < visibles.length; i++) {
        const capa = visibles[i];
        setPaso(`Dibujando ${i + 1} de ${visibles.length}: ${capa.name}…`);
        // El mapa de ESTA capa, sin etiquetas de las demás y sin fondo: es lo
        // que se le da al modelo como referencia de dónde va cada cosa. Para el
        // fondo se fuerza un gris azulado neutro: mapBackground puede venir de
        // un JSON externo y jamás debe colarse como una pantalla magenta.
        const mapa = lienzoDeCapas(
          escena, [capa.id], i > 0, true, i === 0 ? "#101820" : undefined,
        ).toDataURL("image/png");
        let rec: Recorte | null = null;
        let falloCapa = "";
        for (let intento = 0; intento < 2; intento++) {
          if (intento) {
            setPaso(`Corrigiendo croma en ${i + 1} de ${visibles.length}: ${capa.name}…`);
          }
          const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/capa", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mapa,
              prompt: capa.ai?.prompt ?? `The content marked in the map for «${capa.name}».`,
              excluir: capa.ai?.exclude,
              estilo: escena.scene.style,
              escena: escena.scene.description,
              esFondo: i === 0,
              formato,
              corregirCroma: intento > 0,
            }),
          });
          if (!r.ok) {
            falloCapa = j.error ?? "no se pudo";
            break;
          }

          // Aquí se decide si hubo que quitar el fondo, MIRANDO la imagen: no
          // se confía en que la API haya hecho lo que se le pidió. En la capa
          // opaca el color se usa solo para validar; no se vuelve transparente.
          rec = await prepararCapa(
            `data:image/png;base64,${j.imagen}`,
            i === 0,
            i === 0 || j.porCroma ? (j.croma ?? undefined) : undefined,
          );
          if (!rec.problema) break;
          falloCapa = rec.problema === "croma-en-fondo"
            ? "la IA dejó el magenta técnico dentro del fondo"
            : "quedaron residuos de magenta después del recorte";
        }
        // Una capa rosa opaca es peor que una capa ausente: tapa todas las de
        // atrás y hace parecer que el montaje completo se perdió.
        if (!rec || rec.problema) {
          fallos.push(`${capa.name}: ${falloCapa || "no se pudo limpiar el fondo"}`);
          continue;
        }
        out.push({
          id: capa.id, nombre: capa.name, url: rec.url, via: rec.via, vacio: rec.vacio, color: rec.color,
          // El movimiento propio viaja con la capa hasta el montaje: si se
          // quedara en el mapa, el pájaro llegaría al compositor quieto.
          mov: capa.mov,
          depth: capa.depth,
        });
        setHechas([...out]);
      }
      // Sin fondo no hay montaje al que incorporar actores. Además de ser más
      // claro, esto evita pagar hojas de sprites para una escena inutilizable.
      if (out.some((c) => c.id === visibles[0]?.id)) {
        for (let i = 0; i < sprites.length; i++) {
          const actor = sprites[i];
          setPaso(
            `${actor.biblioteca ? "Reutilizando" : "Generando"} actor ${i + 1} de ${sprites.length}: ${actor.nombre}…`,
          );
          try {
            const resuelto = await resolverSpritePlaneado(actor);
            actores.push(resuelto);
            if (resuelto.aviso) avisosActores.push(resuelto.aviso);
          } catch (e) {
            fallos.push(`${actor.nombre}: ${(e as Error).message || "no se pudo"}`);
          }
        }
      } else if (sprites.length) {
        fallos.push("Actores: no se generaron porque falta la capa de fondo.");
      }

      const cromadas = out.filter((c) => c.via === "croma").length;
      const opacas = out.filter((c, i) => i > 0 && c.via === "opaca").length;
      const reutilizados = actores.filter((s) => s.fuente === "biblioteca").length;
      const generados = actores.filter((s) => s.fuente === "generado").length;
      const resumen =
        `${out.length} de ${visibles.length} capas.`
        + (actores.length
          ? ` ${actores.length} actores montados (${reutilizados} reutilizados, ${generados} nuevos y guardados).`
          : sprites.length ? " No se pudo montar ningún actor." : " La escena no necesitó actores animados.")
        + (guias ? ` ${guias} de reserva no se mandó a dibujar —es una guía— así que no se ha pagado.` : "")
        + (cromadas ? ` A ${cromadas} hubo que quitarles el fondo de color: este modelo no devuelve transparencia.` : "")
        + (opacas ? ` OJO: ${opacas} salieron opacas y sin fondo plano que quitar; taparán a las de atrás.` : "")
        + (avisosActores.length ? ` ${avisosActores.join(" ")}` : "")
        + (fallos.length ? ` No salieron ${fallos.length}: ${fallos.join(" · ")}` : "");
      setPaso(resumen);
      // El resumen sube con las capas porque al montarlas esta tarjeta
      // desaparece: si se quedara aquí, lo que costó y lo que no no lo leería
      // nadie.
      if (out.length) onCapas(out, resumen, actores);
      // Los fallos se cuentan al final y por separado, sin borrar lo que sí salió.
      if (fallos.length) setError(`No salieron ${fallos.length}: ${fallos.join(" · ")}`);
    } catch (e) { setError((e as Error).message); setPaso(null); }
    finally { setTrabajando(false); }
  }

  return (
    <div className="card space-y-2 border-brand/40 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand" />
        <span className="label">Director de escena viva</span>
      </div>
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Un taller ferroviario steampunk inundado; un ratón mecánico cruza el suelo, se detiene, gira y vuelve mientras la cámara avanza entre tuberías."
        className="input h-20 w-full resize-y text-xs"
        aria-label="Descripción de la escena"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Formato
          <select value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)} className="input py-1 text-[11px]">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          Capas
          <select value={nCapas} onChange={(e) => setNCapas(Number(e.target.value))} className="input py-1 text-[11px]">
            {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={() => void pedirMapa()} disabled={idea.trim().length < 4 || trabajando} className="btn-brand text-xs">
          {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          1 · Escribir el mapa
        </button>
        <button onClick={() => void dibujar()} disabled={!escena || trabajando} className="btn-ghost text-xs">
          <Wand2 className="h-3.5 w-3.5 text-accent" /> 2 · Generar y montar todo
        </button>
      </div>

      <p className="text-[10px] text-muted">
        Un solo prompt dirige composición, cámara, actores, tamaño, capas y rutas. El mapa es una
        llamada de texto barata: revísalo antes de generar. El segundo paso dibuja una imagen por
        capa, reutiliza los sprites compatibles de la biblioteca y solo fabrica los que falten.
      </p>

      {!!sprites.length && (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-surface-2/40 p-2">
          {sprites.map((s) => (
            <span key={s.id} className="rounded-full border border-border px-2 py-1 text-[10px] text-muted">
              <b className="text-fg">{s.nombre}</b> · {s.biblioteca ? "reutilizar" : "generar"}
              {s.spr.ruta?.pasos.length ? ` · ${s.spr.ruta.pasos.length} pasos` : " · quieto"}
            </span>
          ))}
        </div>
      )}

      {paso && !error && (
        <p className="flex items-start gap-1.5 text-[11px] text-accent">
          {trabajando ? <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin" /> : <Check className="mt-px h-3.5 w-3.5 shrink-0" />}
          {paso}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-danger">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {!!hechas.length && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {hechas.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.url} alt={c.nombre} className="block h-auto w-full bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:14px_14px]" />
              <p className="truncate px-1.5 py-1 text-[9px] text-muted">
                {c.nombre} · {c.via === "croma" ? `croma ${c.color}` : c.via} · {Math.round(c.vacio * 100)}% vacío
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
