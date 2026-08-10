"use client";

import { useState } from "react";
import {
  ChevronDown, ChevronUp, MapPinned, Play, Plus, RotateCcw, Square, Trash2,
} from "lucide-react";
import { MOVS_CAPA, type MovCapa } from "@/lib/lab/movimiento-capa";
import type { PasoRutaSprite, SpriteEnCapa } from "@/lib/lab/sprite-capa";
import type { SuperficieNavegable } from "@/lib/lab/escena";
import { ajustarSpriteALaEscena } from "@/lib/lab/navegacion-escena";
import { Barra } from "./controles-basicos";
import { CamposMovimientoCapa } from "./mandos-movimiento";

// Los mandos de una capa que es un sprite: dónde está, de qué tamaño, hacia
// dónde mira y por qué ruta pasa.
//
// El bloque más grande de todo el montaje, y el que menos tenía que ver con el
// resto: entra un sprite, sale un sprite.

export function MandosSprite({
  spr, mov, superficies, onSpr, onMov,
  corriendo, rutaVisible, onReproducir, onPausar, onReiniciar, onRutaVisible,
}: {
  spr: SpriteEnCapa;
  mov?: MovCapa;
  superficies: SuperficieNavegable[];
  onSpr: (p: Partial<SpriteEnCapa>) => void;
  onMov: (m: MovCapa | undefined) => void;
  corriendo: boolean;
  rutaVisible: boolean;
  onReproducir: () => void;
  onPausar: () => void;
  onReiniciar: () => void;
  onRutaVisible: (visible: boolean) => void;
}) {
  const modo = spr.ruta ? "ruta" : spr.trayectoria ? "trayectoria" : (mov?.tipo ?? "");
  const [pasoAbierto, setPasoAbierto] = useState<number | null>(0);
  const espejoHacia = (desde: number, hasta: number) => {
    if (spr.vista !== "lateral" || Math.abs(hasta - desde) < 0.005) return !!spr.espejo;
    const originalDerecha = spr.direccionBase !== "izquierda";
    return (hasta > desde) !== originalDerecha;
  };

  function guardarPasos(pasos: PasoRutaSprite[]) {
    onSpr({ ruta: { ...spr.ruta!, pasos: pasos.slice(0, 24) } });
  }

  function cambiarPaso(i: number, patch: Partial<PasoRutaSprite>) {
    guardarPasos(spr.ruta!.pasos.map((p, j) => (i === j ? { ...p, ...patch } : p)));
  }

  function reemplazarPaso(i: number, paso: PasoRutaSprite) {
    guardarPasos(spr.ruta!.pasos.map((p, j) => (i === j ? paso : p)));
  }

  function moverPaso(i: number, d: -1 | 1) {
    const j = i + d;
    if (!spr.ruta || j < 0 || j >= spr.ruta.pasos.length) return;
    const pasos = [...spr.ruta.pasos];
    [pasos[i], pasos[j]] = [pasos[j], pasos[i]];
    guardarPasos(pasos);
  }

  function ultimoDestino() {
    let x = spr.x;
    let y = spr.y;
    for (const p of spr.ruta?.pasos ?? []) {
      if (p.tipo === "mover") { x = p.x ?? x; y = p.y ?? y; }
    }
    return { x, y };
  }

  function destinoAntes(i: number) {
    let x = spr.x;
    let y = spr.y;
    for (const p of spr.ruta?.pasos.slice(0, i) ?? []) {
      if (p.tipo === "mover") { x = p.x ?? x; y = p.y ?? y; }
    }
    return { x, y };
  }

  function elegirMovimiento(t: string) {
    if (!t) {
      onSpr({ trayectoria: undefined, ruta: undefined });
      onMov(undefined);
      onRutaVisible(false);
      return;
    }
    if (t === "trayectoria") {
      onMov(undefined);
      onSpr({
        ruta: undefined,
        espejo: espejoHacia(spr.x, spr.x < 0.9 ? 1.2 : -0.2),
        trayectoria: {
          x: spr.x < 0.9 ? 1.2 : -0.2,
          y: spr.y,
          segundos: 4,
        },
      });
      onRutaVisible(true);
      onReiniciar();
      return;
    }
    if (t === "ruta") {
      const bx = spr.x < 0.9 ? 1.2 : -0.2;
      onMov(undefined);
      onSpr({
        trayectoria: undefined,
        ruta: {
          bucle: true,
          pasos: [
            { tipo: "mover", x: bx, y: spr.y, segundos: 4, espejo: espejoHacia(spr.x, bx) },
            { tipo: "pausa", segundos: 1 },
            { tipo: "voltear", segundos: 0.1 },
            { tipo: "mover", x: spr.x, y: spr.y, segundos: 4 },
          ],
        },
      });
      onRutaVisible(true);
      onReiniciar();
      return;
    }
    onSpr({ trayectoria: undefined, ruta: undefined });
    onRutaVisible(false);
    // Valores de salida que ya se ven bien: un pájaro que cruza en unos ocho
    // segundos, o un balanceo corto. Luego se afinan aquí mismo.
    if (t === "deriva") onMov({ tipo: "deriva", x: 0.12, y: 0, bucle: true });
    else onMov({ tipo: t as MovCapa["tipo"], amplitud: 0.04, segundos: 3.5 });
    onReiniciar();
  }

  return (
    <div className="space-y-1.5 rounded-md border border-accent/25 bg-accent/5 p-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-accent">
          Sprite · {spr.fotogramas} fotogramas
        </span>
        <button
          type="button"
          onClick={() => onSpr({ espejo: !spr.espejo })}
          className={`ml-auto rounded border px-1 py-0.5 text-[9px] ${
            spr.espejo ? "border-accent text-accent" : "border-border text-muted hover:text-fg"
          }`}
          title="Mirar al otro lado"
        >
          ⇄ espejo
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <button type="button" onClick={onReproducir} disabled={corriendo}
          className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-35" title="Reproducir este sprite">
          <Play className="h-3 w-3" /> Play
        </button>
        <button type="button" onClick={onPausar} disabled={!corriendo}
          className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-35" title="Detener este sprite donde está">
          <Square className="h-3 w-3" /> Stop
        </button>
        <button type="button" onClick={onReiniciar}
          className="btn-ghost justify-center px-1 py-1 text-[9px]" title="Volver al punto A y reproducir">
          <RotateCcw className="h-3 w-3" /> Desde A
        </button>
        <button type="button" onClick={() => onRutaVisible(!rutaVisible)}
          disabled={!spr.trayectoria && !spr.ruta}
          className={`btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-35 ${rutaVisible ? "border-accent text-accent" : ""}`}
          title="Mostrar puntos y recorrido en la vista">
          <MapPinned className="h-3 w-3" /> Ruta
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="w-16 shrink-0">Se ancla a</span>
        <select
          className="input min-w-0 flex-1 py-0.5 text-[10px]"
          value={spr.espacio === "pantalla" ? "pantalla" : "capa"}
          onChange={(e) => onSpr({ espacio: e.target.value as SpriteEnCapa["espacio"] })}
        >
          <option value="pantalla">Lienzo · ruta absoluta, ignora cámara</option>
          <option value="capa">Su capa/superficie · integrado en 2.5D</option>
        </select>
      </label>
      <p className="text-[9px] leading-snug text-muted">
        {spr.espacio === "pantalla"
          ? "Su ruta no cambia con paneos, zooms ni fundidos de cámara."
          : "Hereda cámara, profundidad y zoom: no se despega del suelo, vía o agua del decorado."}
      </p>
      {spr.superficieId && spr.espacio === "pantalla" && (
        <div className="flex items-center gap-1 rounded border border-gold/40 bg-gold/5 px-1.5 py-1 text-[9px] text-gold">
          <span className="min-w-0 flex-1">Tiene superficie, pero está en lienzo: un zoom podría separarlo de ella.</span>
          <button type="button" onClick={() => onSpr({ espacio: "capa" })}
            className="shrink-0 rounded border border-gold/50 px-1 py-0.5 text-[8px]">
            Fijar a superficie
          </button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-1">
        <label className="text-[9px] text-muted">
          <span className="block">Vista del dibujo</span>
          <select value={spr.vista ?? "lateral"}
            onChange={(e) => onSpr({ vista: e.target.value as SpriteEnCapa["vista"] })}
            className="input mt-0.5 w-full py-0.5 text-[9px]">
            <option value="lateral">Lateral</option><option value="frontal">Frontal</option>
            <option value="trasera">Trasera</option><option value="superior">Superior</option><option value="libre">Libre</option>
          </select>
        </label>
        <label className="text-[9px] text-muted">
          <span className="block">Dibujo apunta a</span>
          <select value={spr.direccionBase ?? "derecha"}
            onChange={(e) => {
              const direccionBase = e.target.value as SpriteEnCapa["direccionBase"];
              const orientado = ajustarSpriteALaEscena({ ...spr, direccionBase });
              onSpr({ direccionBase, espejo: orientado.espejo, ruta: orientado.ruta });
              onReiniciar();
            }}
            className="input mt-0.5 w-full py-0.5 text-[9px]">
            <option value="derecha">Derecha</option><option value="izquierda">Izquierda</option>
            <option value="frente">Frente</option><option value="espaldas">Espaldas</option>
            <option value="arriba">Arriba</option><option value="abajo">Abajo</option><option value="ninguna">Sin dirección</option>
          </select>
        </label>
        <label className="text-[9px] text-muted">
          <span className="block">Posición se mide por</span>
          <select value={spr.anclaje ?? "centro"}
            onChange={(e) => onSpr({ anclaje: e.target.value as SpriteEnCapa["anclaje"] })}
            className="input mt-0.5 w-full py-0.5 text-[9px]">
            <option value="centro">Centro</option><option value="pies">Pies / apoyo</option>
          </select>
        </label>
      </div>
      {!!superficies.length ? (
        <label className="flex items-center gap-1.5 text-[9px] text-muted">
          <span className="w-16 shrink-0">Superficie</span>
          <select className="input min-w-0 flex-1 py-0.5 text-[9px]" value={spr.superficieId ?? ""}
            onChange={(e) => {
              const superficie = superficies.find((s) => s.id === e.target.value);
              if (!superficie) {
                onSpr({ superficieId: undefined });
                return;
              }
              onSpr(ajustarSpriteALaEscena({
                ...spr, superficieId: superficie.id, espacio: "capa",
              }, superficie));
              onReiniciar();
            }}>
            <option value="">— Ruta libre —</option>
            {superficies.map((s) => (
              <option key={s.id} value={s.id}>{s.tipo} · {s.id}</option>
            ))}
          </select>
        </label>
      ) : spr.superficieId ? (
        <p className="truncate text-[8px] text-accent" title={spr.superficieId}>Superficie: {spr.superficieId}</p>
      ) : null}
      <Barra etiqueta={spr.trayectoria || spr.ruta ? "A · X" : "Izq · der"} valor={spr.x} min={-0.5} max={1.5} paso={0.01}
        onCambio={(v) => { onSpr({ x: v }); if (spr.trayectoria || spr.ruta) onReiniciar(); }} formato={(v) => v.toFixed(2)} />
      <Barra etiqueta={spr.trayectoria || spr.ruta ? "A · Y" : "Arr · abj"} valor={spr.y} min={-0.5} max={1.5} paso={0.01}
        onCambio={(v) => { onSpr({ y: v }); if (spr.trayectoria || spr.ruta) onReiniciar(); }} formato={(v) => v.toFixed(2)} />
      <Barra etiqueta="Tamaño" valor={spr.alto} min={0.01} max={2} paso={0.01}
        onCambio={(v) => onSpr({ alto: v })} formato={(v) => `${Math.round(v * 100)}%`} />
      <Barra etiqueta="Velocidad" valor={spr.fps} min={1} max={30} paso={1}
        onCambio={(v) => onSpr({ fps: Math.round(v) })} formato={(v) => `${v}/s`} />
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="w-16 shrink-0">Se mueve</span>
        <select
          className="input min-w-0 flex-1 py-0.5 text-[10px]"
          value={modo}
          onChange={(e) => elegirMovimiento(e.target.value)}
        >
          <option value="">— quieto en su sitio —</option>
          <option value="trayectoria">Punto A → punto B</option>
          <option value="ruta">Secuencia encadenada · videojuego</option>
          {MOVS_CAPA.filter((m) => m.id !== "trayectoria").map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </label>
      {(spr.trayectoria || spr.ruta) && (
        <label className="flex items-center gap-1 text-[9px] text-muted">
          <input type="checkbox" checked={spr.sincronizar !== false}
            onChange={(e) => onSpr({ sincronizar: e.target.checked })} />
          Reiniciar junto con la cámara y sus transiciones
        </label>
      )}
      {spr.trayectoria && (
        <div className="space-y-1 rounded border border-border/70 bg-surface/40 p-1">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-medium text-fg">Destino B</span>
            <button
              type="button"
              onClick={() => {
                const b = spr.trayectoria!;
                onSpr({
                  x: b.x,
                  y: b.y,
                  trayectoria: { ...b, x: spr.x, y: spr.y },
                });
                onReiniciar();
              }}
              className="ml-auto rounded border border-border px-1 py-0.5 text-[9px] text-muted hover:text-fg"
              title="Intercambiar punto A y punto B"
            >
              ⇄ intercambiar A/B
            </button>
          </div>
          <Barra etiqueta="B · X" valor={spr.trayectoria.x} min={-0.5} max={1.5} paso={0.01}
            onCambio={(v) => { onSpr({ trayectoria: { ...spr.trayectoria!, x: v } }); onReiniciar(); }}
            formato={(v) => v.toFixed(2)} />
          <Barra etiqueta="B · Y" valor={spr.trayectoria.y} min={-0.5} max={1.5} paso={0.01}
            onCambio={(v) => { onSpr({ trayectoria: { ...spr.trayectoria!, y: v } }); onReiniciar(); }}
            formato={(v) => v.toFixed(2)} />
          <Barra etiqueta="Duración" valor={spr.trayectoria.segundos} min={0.2} max={30} paso={0.1}
            onCambio={(v) => { onSpr({ trayectoria: { ...spr.trayectoria!, segundos: v } }); onReiniciar(); }}
            formato={(v) => `${v.toFixed(1)}s`} />
          <div className="flex flex-wrap items-center gap-2 text-[9px] text-muted">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!spr.trayectoria.bucle}
                onChange={(e) => {
                  onSpr({ trayectoria: { ...spr.trayectoria!, bucle: e.target.checked } });
                  onReiniciar();
                }}
              />
              Repetir recorrido
            </label>
            <button type="button" onClick={onReiniciar} className="ml-auto rounded border border-border px-1.5 py-0.5 hover:text-fg">
              Probar desde A
            </button>
          </div>
        </div>
      )}
      {spr.ruta && (
        <div className="space-y-1.5 rounded border border-accent/30 bg-surface/40 p-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-medium text-fg">Secuencia encadenada</span>
            <span className="ml-auto text-[8px] text-muted">mover · esperar · voltear</span>
          </div>
          {spr.ruta.pasos.map((paso, i) => (
            <div key={i} className="space-y-1 rounded border border-border/70 bg-surface-2/45 p-1">
              <div className="flex items-center gap-1">
                <span className="chip bg-surface text-[8px] text-muted">{i + 1}</span>
                <select
                  className="input min-w-0 flex-1 py-0.5 text-[9px]"
                  value={paso.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value as PasoRutaSprite["tipo"];
                    if (tipo === "mover") reemplazarPaso(i, { tipo, ...destinoAntes(i), segundos: 2 });
                    else if (tipo === "pausa") reemplazarPaso(i, { tipo, segundos: 1 });
                    else reemplazarPaso(i, { tipo, segundos: 0.1 });
                  }}
                >
                  <option value="mover">Mover a un punto</option>
                  <option value="pausa">Detenerse aquí</option>
                  <option value="voltear">Darse la vuelta</option>
                </select>
                <button type="button" onClick={() => moverPaso(i, -1)} disabled={i === 0}
                  className="rounded border border-border p-0.5 text-muted disabled:opacity-25" aria-label="Subir paso">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => moverPaso(i, 1)} disabled={i === spr.ruta!.pasos.length - 1}
                  className="rounded border border-border p-0.5 text-muted disabled:opacity-25" aria-label="Bajar paso">
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => guardarPasos(spr.ruta!.pasos.filter((_, j) => i !== j))}
                  disabled={spr.ruta!.pasos.length === 1}
                  className="rounded border border-border p-0.5 text-muted hover:text-danger disabled:opacity-25" aria-label="Borrar paso">
                  <Trash2 className="h-3 w-3" />
                </button>
                <button type="button" onClick={() => setPasoAbierto((v) => v === i ? null : i)}
                  className="rounded border border-border p-0.5 text-muted hover:text-fg"
                  aria-label={pasoAbierto === i ? "Cerrar ajustes del paso" : "Editar paso"}>
                  <ChevronDown className={`h-3 w-3 transition-transform ${pasoAbierto === i ? "rotate-180" : ""}`} />
                </button>
              </div>
              {pasoAbierto === i && (
                <div className="space-y-1 border-t border-border/50 pt-1">
                  {paso.tipo === "mover" && (
                    <>
                      <Barra etiqueta="Destino X" valor={paso.x ?? destinoAntes(i).x} min={-0.5} max={1.5} paso={0.01}
                        onCambio={(v) => cambiarPaso(i, { x: v })} formato={(v) => v.toFixed(2)} />
                      <Barra etiqueta="Destino Y" valor={paso.y ?? destinoAntes(i).y} min={-0.5} max={1.5} paso={0.01}
                        onCambio={(v) => cambiarPaso(i, { y: v })} formato={(v) => v.toFixed(2)} />
                    </>
                  )}
                  {paso.tipo !== "voltear" ? (
                    <>
                      {paso.tipo === "mover" && (
                        <label className="flex items-center gap-1 text-[8px] text-muted">
                          <span>Ritmo</span>
                          <select className="input min-w-0 flex-1 py-0.5 text-[8px]"
                            value={paso.suavizado ?? "lineal"}
                            onChange={(e) => cambiarPaso(i, {
                              suavizado: e.target.value as "lineal" | "suave",
                            })}>
                            <option value="lineal">Lineal · paso constante</option>
                            <option value="suave">Suave · acelera y frena</option>
                          </select>
                        </label>
                      )}
                      <Barra etiqueta={paso.tipo === "mover" ? "Duración" : "Espera"}
                        valor={paso.segundos} min={0.1} max={120} paso={0.1}
                        onCambio={(v) => cambiarPaso(i, { segundos: v })} formato={(v) => `${v.toFixed(1)}s`} />
                      <label className="flex items-center gap-1 text-[8px] text-muted">
                        <span>Sentido</span>
                        <select className="input min-w-0 flex-1 py-0.5 text-[8px]"
                          value={typeof paso.espejo === "boolean" ? (paso.espejo ? "invertido" : "normal") : "conservar"}
                          onChange={(e) => cambiarPaso(i, {
                            espejo: e.target.value === "conservar" ? undefined : e.target.value === "invertido",
                          })}>
                          <option value="conservar">Conservar el paso anterior</option>
                          <option value="normal">Orientación original</option>
                          <option value="invertido">Orientación invertida</option>
                        </select>
                      </label>
                    </>
                  ) : (
                    <p className="text-[8px] text-muted">Invierte el sentido en este punto y los pasos siguientes lo conservan.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => {
              const p = ultimoDestino();
              guardarPasos([...spr.ruta!.pasos, {
                tipo: "mover", x: Math.min(1.5, p.x + 0.2), y: p.y, segundos: 2,
              }]);
            }} className="btn-ghost px-1.5 py-0.5 text-[8px]">
              <Plus className="h-3 w-3" /> Destino
            </button>
            <button type="button" onClick={() => guardarPasos([
              ...spr.ruta!.pasos, { tipo: "pausa", segundos: 1 },
            ])} className="btn-ghost px-1.5 py-0.5 text-[8px]">
              <Plus className="h-3 w-3" /> Pausa
            </button>
            <button type="button" onClick={() => guardarPasos([
              ...spr.ruta!.pasos, { tipo: "voltear", segundos: 0.1 },
            ])} className="btn-ghost px-1.5 py-0.5 text-[8px]">
              <Plus className="h-3 w-3" /> Giro
            </button>
            <label className="ml-auto flex items-center gap-1 text-[8px] text-muted">
              <input type="checkbox" checked={!!spr.ruta.bucle}
                onChange={(e) => onSpr({ ruta: { ...spr.ruta!, bucle: e.target.checked } })} />
              Repetir ruta
            </label>
          </div>
          <p className="text-[8px] leading-snug text-muted">
            Stop congela el objeto para colocarlo. La línea y el punto actual se actualizan al mover cada control.
            Todo se guarda en <code>montaje.json</code> como <code>spr.ruta.pasos</code>, así que la IA también puede definirlo completo.
          </p>
        </div>
      )}
      {mov && <CamposMovimientoCapa mov={mov} onMov={onMov} onReiniciar={onReiniciar} />}
    </div>
  );
}

/** «Derecha → + Acercarse», para que en la cola se vea que hace dos cosas. */
