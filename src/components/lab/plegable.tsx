"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// Secciones que se pliegan Y SE QUEDAN COMO LAS DEJASTE.
//
// El montaje tiene el lienzo arriba y los mandos debajo, y son muchos: para
// tocar la profundidad había que bajar, y desde abajo ya no se veía lo que
// estabas cambiando. Plegar lo que no usas sube el resto a la pantalla.
//
// LO IMPORTANTE ES LA MEMORIA, no el plegado. Un panel que se cierra solo cada
// vez que la página se vuelve a pintar —o al recargar— obliga a rehacer la
// misma decisión veinte veces por sesión, y acaba estorbando más que ayudar.
// Se guarda en el navegador, por sección, y sobrevive a la recarga.

const CLAVE = "tvphi.lab.plegados";

type Estado = Record<string, boolean>;

function leer(): Estado {
  if (typeof window === "undefined") return {};
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    const v = crudo ? JSON.parse(crudo) : null;
    return v && typeof v === "object" ? (v as Estado) : {};
  } catch {
    // Modo privado, cuota llena o un valor corrupto de una versión anterior.
    // Nada de esto justifica romper el editor: se abre todo y a seguir.
    return {};
  }
}

/**
 * Qué secciones están abiertas, recordado entre visitas.
 *
 * `abiertoPorDefecto` decide solo la PRIMERA vez que se ve una sección; en
 * cuanto el usuario la toca, manda lo suyo.
 */
export function usePlegados() {
  const [estado, setEstado] = useState<Estado>({});
  // Se lee después de montar: en el servidor no hay localStorage, y leerlo
  // durante el primer render dejaría el HTML del servidor y el del navegador
  // distintos (el aviso de hidratación de React).
  useEffect(() => { setEstado(leer()); }, []);

  const abierto = useCallback(
    (id: string, porDefecto = true) => estado[id] ?? porDefecto,
    [estado],
  );

  const alternar = useCallback((id: string, porDefecto = true) => {
    setEstado((prev) => {
      const siguiente = { ...prev, [id]: !(prev[id] ?? porDefecto) };
      try {
        window.localStorage.setItem(CLAVE, JSON.stringify(siguiente));
      } catch { /* sin memoria, pero la sesión sigue funcionando */ }
      return siguiente;
    });
  }, []);

  return { abierto, alternar };
}

/**
 * Una sección plegable con su cabecera.
 *
 * `resumen` es lo que se ve cuando está cerrada: sin él, plegar convierte la
 * sección en una fila muda y hay que abrirla para recordar qué había dentro.
 */
export function Plegable({
  id,
  titulo,
  resumen,
  abierto,
  onAlternar,
  acciones,
  children,
  tono = "normal",
}: {
  id: string;
  titulo: React.ReactNode;
  resumen?: React.ReactNode;
  abierto: boolean;
  onAlternar: () => void;
  /** Botones que siguen a mano con la sección cerrada. */
  acciones?: React.ReactNode;
  children: React.ReactNode;
  tono?: "normal" | "acento";
}) {
  const cuerpo = `plegable-${id}`;
  return (
    <div className={`rounded-lg border ${
      tono === "acento" ? "border-accent/40 bg-accent/5" : "border-border bg-surface-2/40"
    }`}>
      <div className="flex items-center gap-1.5 p-2">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          aria-controls={cuerpo}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {abierto
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
          <span className={`shrink-0 text-[10px] font-semibold ${tono === "acento" ? "text-accent" : "text-fg"}`}>
            {titulo}
          </span>
          {!abierto && resumen && (
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted">{resumen}</span>
          )}
        </button>
        {acciones}
      </div>
      <div id={cuerpo} className={abierto ? "space-y-2 px-2 pb-2" : "hidden"}>
        {children}
      </div>
    </div>
  );
}
