// Presets de cámara para el compositor del laboratorio.
//
// No tocan el motor del vídeo: solo la vista previa. El movimiento real del
// capítulo sigue siendo el de la toma (izquierda, acercar…). Aquí se prueba
// cómo se ven las capas con distintos recorridos.

export type AnimParalaje =
  | "suave"
  | "izq-der"
  | "der-izq"
  | "arriba-abajo"
  | "abajo-arriba"
  | "acercar"
  | "alejar"
  | "diagonal"
  | "orbita"
  | "dolly-izq";

export const ANIM_OPCIONES: { id: AnimParalaje; label: string; pista: string }[] = [
  { id: "suave", label: "Suave (idle)", pista: "Va y viene en círculo suave" },
  { id: "izq-der", label: "Izquierda → derecha", pista: "Travelling horizontal" },
  { id: "der-izq", label: "Derecha → izquierda", pista: "Travelling al revés" },
  { id: "arriba-abajo", label: "Arriba → abajo", pista: "Tilt hacia abajo" },
  { id: "abajo-arriba", label: "Abajo → arriba", pista: "Tilt hacia arriba" },
  { id: "acercar", label: "Acercarse", pista: "Zoom in con paralaje" },
  { id: "alejar", label: "Alejarse", pista: "Zoom out" },
  { id: "diagonal", label: "Diagonal", pista: "Pan en diagonal" },
  { id: "orbita", label: "Órbita", pista: "Rodea el centro" },
  { id: "dolly-izq", label: "Dolly + acercar", pista: "Avanza mientras se desplaza" },
];

/** 0→1→0 en un ciclo. */
function idaVuelta(t: number) {
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

/**
 * Desplazamiento y zoom de cámara para un instante.
 * `k` es la fuerza (≈0.08 a fuerza 100). `t` va de 0 a 1 en el ciclo.
 */
export function camaraAnim(
  kind: AnimParalaje,
  ms: number,
  k: number,
  durMs = 4500,
): { ox: number; oy: number; zoom: number } {
  const t = ((ms % durMs) + durMs) % durMs / durMs;
  const ping = idaVuelta(t);
  const swing = ping * 2 - 1; // -1 → +1 → -1

  switch (kind) {
    case "suave": {
      const s = ms / 3000;
      return { ox: Math.sin(s) * k, oy: Math.cos(s * 0.75) * k * 0.35, zoom: 1 };
    }
    case "izq-der":
      return { ox: swing * k, oy: 0, zoom: 1 };
    case "der-izq":
      return { ox: -swing * k, oy: 0, zoom: 1 };
    case "arriba-abajo":
      return { ox: 0, oy: swing * k * 0.65, zoom: 1 };
    case "abajo-arriba":
      return { ox: 0, oy: -swing * k * 0.65, zoom: 1 };
    case "acercar":
      // Empieza lejos y se acerca (zoom crece).
      return { ox: 0, oy: 0, zoom: 1 + ping * Math.max(0.06, k * 1.4) };
    case "alejar":
      return { ox: 0, oy: 0, zoom: 1 + (1 - ping) * Math.max(0.06, k * 1.4) };
    case "diagonal":
      return { ox: swing * k, oy: swing * k * 0.55, zoom: 1 };
    case "orbita": {
      const a = t * Math.PI * 2;
      return { ox: Math.cos(a) * k, oy: Math.sin(a) * k * 0.55, zoom: 1 };
    }
    case "dolly-izq":
      // Avanza (zoom) mientras se desplaza a la izquierda.
      return {
        ox: -swing * k * 0.85,
        oy: 0,
        zoom: 1 + ping * Math.max(0.05, k * 1.1),
      };
    default:
      return { ox: 0, oy: 0, zoom: 1 };
  }
}
