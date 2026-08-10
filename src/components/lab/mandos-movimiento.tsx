"use client";

import { Play, RotateCcw, Square } from "lucide-react";
import { MOVS_CAPA, type MovCapa } from "@/lib/lab/movimiento-capa";
import { Barra } from "./controles-basicos";

// Los mandos del movimiento propio de una capa.
//
// Reciben el movimiento y devuelven otro: no tocan el montaje ni saben qué
// capa es. Por eso se pueden leer y cambiar sin entender el compositor entero.

const PRESETS_DESPLAZAMIENTO: { nombre: string; mov: MovCapa; pista: string }[] = [
  { nombre: "Nube", mov: { tipo: "deriva", x: 0.02, y: 0, bucle: true }, pista: "muy lento hacia la derecha" },
  { nombre: "Tren", mov: { tipo: "deriva", x: 0.04, y: 0, bucle: true }, pista: "lento hacia la derecha" },
  { nombre: "Pájaro", mov: { tipo: "deriva", x: 0.2, y: 0, bucle: true }, pista: "rápido hacia la derecha" },
  { nombre: "Meteorito ↘", mov: { tipo: "deriva", x: 1.2, y: 0.45, bucle: false }, pista: "una pasada diagonal" },
];

export function movimientoInicial(tipo: string): MovCapa | undefined {
  if (!tipo) return undefined;
  if (tipo === "trayectoria") return {
    tipo, espacio: "capa", desdeX: 0, desdeY: 0, x: 0.5, y: 0,
    segundos: 4, suavizado: "suave", volver: false, bucle: false,
  };
  if (tipo === "deriva") return { tipo, espacio: "capa", x: 0.04, y: 0, bucle: true };
  return { tipo: tipo as MovCapa["tipo"], espacio: "capa", amplitud: 0.03, segundos: 4, desfase: 0 };
}

/**
 * Todos los parámetros que el director IA puede escribir en `mov`, expuestos
 * con los mismos límites para una persona. Lo usan tanto una capa normal como
 * un sprite para que no existan dos versiones distintas de la misma función.
 */
export function CamposMovimientoCapa({ mov, onMov, onReiniciar }: {
  mov: MovCapa;
  onMov: (m: MovCapa) => void;
  onReiniciar: () => void;
}) {
  if (mov.tipo === "trayectoria") {
    return (
      <div className="space-y-1.5">
        <div className="grid gap-1 sm:grid-cols-2">
          <div className="space-y-1 rounded border border-border/70 bg-surface/35 p-1">
            <p className="text-[9px] font-medium text-fg">Punto A · inicio</p>
            <Barra etiqueta="A · X" valor={mov.desdeX ?? 0} min={-3} max={3} paso={0.01}
              onCambio={(v) => onMov({ ...mov, desdeX: v })} formato={(v) => v.toFixed(2)} />
            <Barra etiqueta="A · Y" valor={mov.desdeY ?? 0} min={-3} max={3} paso={0.01}
              onCambio={(v) => onMov({ ...mov, desdeY: v })} formato={(v) => v.toFixed(2)} />
          </div>
          <div className="space-y-1 rounded border border-accent/30 bg-accent/5 p-1">
            <p className="text-[9px] font-medium text-accent">Punto B · destino</p>
            <Barra etiqueta="B · X" valor={mov.x ?? 0.5} min={-3} max={3} paso={0.01}
              onCambio={(v) => onMov({ ...mov, x: v })} formato={(v) => v.toFixed(2)} />
            <Barra etiqueta="B · Y" valor={mov.y ?? 0} min={-3} max={3} paso={0.01}
              onCambio={(v) => onMov({ ...mov, y: v })} formato={(v) => v.toFixed(2)} />
          </div>
        </div>
        <Barra etiqueta="Duración" valor={mov.segundos ?? 4} min={0.1} max={120} paso={0.1}
          onCambio={(v) => onMov({ ...mov, segundos: v })} formato={(v) => `${v.toFixed(1)}s`} />
        <div className="flex flex-wrap items-center gap-2 text-[9px] text-muted">
          <label className="flex items-center gap-1">
            Ritmo
            <select className="input py-0.5 text-[9px]" value={mov.suavizado ?? "suave"}
              onChange={(e) => onMov({ ...mov, suavizado: e.target.value as "suave" | "lineal" })}>
              <option value="suave">Suave · acelera y frena</option>
              <option value="lineal">Lineal · velocidad constante</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={mov.volver === true}
              onChange={(e) => onMov({ ...mov, volver: e.target.checked })} />
            Volver B → A
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={mov.bucle === true}
              onChange={(e) => onMov({ ...mov, bucle: e.target.checked })} />
            Repetir
          </label>
        </div>
        <button type="button" onClick={() => {
          onMov({
            ...mov,
            desdeX: mov.x ?? 0.5, desdeY: mov.y ?? 0,
            x: mov.desdeX ?? 0, y: mov.desdeY ?? 0,
          });
          onReiniciar();
        }} className="rounded border border-border px-1.5 py-1 text-[9px] text-muted hover:text-fg">
          ⇄ Intercambiar A/B
        </button>
        <p className="text-[9px] leading-snug text-muted">
          A y B son desplazamientos desde la posición original generada; 1.00 equivale a un ancho o alto completo del plano.
        </p>
      </div>
    );
  }

  if (mov.tipo === "deriva") {
    const inmovil = (mov.x ?? 0) === 0 && (mov.y ?? 0) === 0;
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1">
          {PRESETS_DESPLAZAMIENTO.map((p) => (
            <button key={p.nombre} type="button"
              onClick={() => {
                onMov({
                  ...p.mov,
                  espacio: mov.espacio ?? "capa",
                  referenciaCapaId: mov.referenciaCapaId,
                });
                onReiniciar();
              }}
              className="rounded border border-border bg-surface/50 px-1.5 py-1 text-[9px] text-muted hover:border-accent/60 hover:text-fg"
              title={p.pista}>
              {p.nombre}
            </button>
          ))}
        </div>
        <Barra etiqueta="Horizontal" valor={mov.x ?? 0} min={-3} max={3} paso={0.01}
          onCambio={(v) => onMov({ ...mov, x: v })}
          formato={(v) => (v === 0 ? "—" : `${v > 0 ? "→" : "←"}${Math.abs(v).toFixed(2)}`)} />
        <Barra etiqueta="Vertical" valor={mov.y ?? 0} min={-3} max={3} paso={0.01}
          onCambio={(v) => onMov({ ...mov, y: v })}
          formato={(v) => (v === 0 ? "—" : `${v > 0 ? "↓" : "↑"}${Math.abs(v).toFixed(2)}`)} />
        <label className="flex items-center gap-1.5 text-[9px] text-muted">
          <input type="checkbox" checked={mov.bucle !== false}
            onChange={(e) => onMov({ ...mov, bucle: e.target.checked })} />
          Reaparecer por el borde contrario
        </label>
        <button type="button" disabled={inmovil}
          onClick={() => { onMov({ ...mov, x: -(mov.x ?? 0), y: -(mov.y ?? 0) }); onReiniciar(); }}
          className="rounded border border-border px-1.5 py-1 text-[9px] text-muted hover:text-fg disabled:opacity-35">
          ⇄ Invertir dirección
        </button>
        {inmovil && <p className="text-[9px] text-gold">Horizontal y vertical están en cero: la capa no se moverá.</p>}
        <p className="text-[9px] leading-snug text-muted">
          Los valores positivos van a la derecha y abajo; los negativos, a la izquierda y arriba.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Barra etiqueta="Amplitud" valor={mov.amplitud ?? 0.03} min={0} max={0.5} paso={0.01}
        onCambio={(v) => onMov({ ...mov, amplitud: v })} formato={(v) => v.toFixed(2)} />
      <Barra etiqueta="Ciclo" valor={mov.segundos ?? 4} min={0.3} max={60} paso={0.1}
        onCambio={(v) => onMov({ ...mov, segundos: v })} formato={(v) => `${v.toFixed(1)}s`} />
      <Barra etiqueta="Desfase" valor={mov.desfase ?? 0} min={0} max={1} paso={0.01}
        onCambio={(v) => onMov({ ...mov, desfase: v })} formato={(v) => `${Math.round(v * 100)}%`} />
      <p className="text-[9px] leading-snug text-muted">
        Desfase permite que varias capas no empiecen el ciclo exactamente al mismo tiempo.
      </p>
    </div>
  );
}

/** Movimiento propio para una imagen normal, antes disponible solo por JSON/IA. */
export function MandosMovimientoCapa({
  mov, referencias, onMov, corriendo, onReproducir, onPausar, onReiniciar,
}: {
  mov?: MovCapa;
  referencias: { id: string; nombre: string }[];
  onMov: (m: MovCapa | undefined) => void;
  corriendo: boolean;
  onReproducir: () => void;
  onPausar: () => void;
  onReiniciar: () => void;
}) {
  const pista = MOVS_CAPA.find((m) => m.id === mov?.tipo)?.pista;
  function elegir(tipo: string) {
    const inicial = movimientoInicial(tipo);
    const siguiente = inicial && mov ? {
      ...inicial,
      espacio: mov.espacio ?? "capa",
      referenciaCapaId: mov.referenciaCapaId,
    } : inicial;
    onMov(siguiente);
    if (siguiente) onReiniciar();
  }

  return (
    <div className="space-y-1.5 rounded-md border border-accent/25 bg-accent/5 p-1.5">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-medium text-accent">Movimiento propio de esta capa</p>
        {mov && <span className="ml-auto chip bg-surface text-[8px] text-muted">además de la cámara</span>}
      </div>
      <label className="flex items-center gap-1.5 text-[10px] text-muted">
        <span className="w-16 shrink-0">Se mueve</span>
        <select className="input min-w-0 flex-1 py-0.5 text-[10px]" value={mov?.tipo ?? ""}
          onChange={(e) => elegir(e.target.value)}>
          <option value="">— quieta en su sitio —</option>
          {MOVS_CAPA.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      {pista && <p className="text-[9px] leading-snug text-muted">{pista}.</p>}
      {mov && (
        <>
          <div className="grid gap-1 sm:grid-cols-2">
            <label className="text-[9px] text-muted">
              Coordenadas del movimiento
              <select className="input mt-0.5 w-full py-0.5 text-[9px]" value={mov.espacio ?? "capa"}
                onChange={(e) => onMov({
                  ...mov,
                  espacio: e.target.value as "capa" | "pantalla",
                  ...(e.target.value === "pantalla" ? { referenciaCapaId: undefined } : {}),
                })}>
                <option value="capa">Plano 2.5D · sigue zoom y paralaje</option>
                <option value="pantalla">Lienzo · ignora la cámara</option>
              </select>
            </label>
            <label className="text-[9px] text-muted">
              Se apoya o alinea con
              <select className="input mt-0.5 w-full py-0.5 text-[9px]"
                value={mov.referenciaCapaId ?? ""}
                onChange={(e) => onMov({
                  ...mov,
                  espacio: "capa",
                  referenciaCapaId: e.target.value || undefined,
                })}>
                <option value="">— ninguna capa —</option>
                {referencias.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </label>
          </div>
          {mov.referenciaCapaId && (
            <p className="rounded border border-accent/25 bg-accent/5 px-1.5 py-1 text-[9px] leading-snug text-accent">
              Profundidad ligada a la capa de referencia: el objeto conservará su alineación durante zoom y paralaje.
            </p>
          )}
          <div className="grid grid-cols-3 gap-1">
            <button type="button" onClick={onReproducir} disabled={corriendo}
              className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-35">
              <Play className="h-3 w-3" /> Play
            </button>
            <button type="button" onClick={onPausar} disabled={!corriendo}
              className="btn-ghost justify-center px-1 py-1 text-[9px] disabled:opacity-35">
              <Square className="h-3 w-3" /> Stop
            </button>
            <button type="button" onClick={onReiniciar}
              className="btn-ghost justify-center px-1 py-1 text-[9px]">
              <RotateCcw className="h-3 w-3" /> Desde inicio
            </button>
          </div>
          <CamposMovimientoCapa mov={mov} onMov={onMov} onReiniciar={onReiniciar} />
          <p className="text-[9px] leading-snug text-muted">
            Se mueve la imagen completa y conserva su paralaje. Para desplazar solo un tren, pájaro u objeto, debe estar aislado en su propia capa transparente.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Los mandos de una capa que es un sprite.
 *
 * Un sprite recién metido cae en el centro y a un quinto de alto, que casi
 * nunca es donde va. Sin sitio, tamaño y sentido de la marcha, la biblioteca
 * serviría para mirar los bichos y para nada más.
 *
 * Lo de «cruza» está aquí y no en un panel de movimiento aparte porque es lo
 * que se quiere el 90% de las veces: un pájaro entra por un lado y sale por el
 * otro. Los demás movimientos se afinan luego, con el resto de la escena.
 */
