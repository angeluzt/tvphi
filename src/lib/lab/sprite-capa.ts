// Un sprite metido como capa del montaje.
//
// QUÉ CAMBIA RESPECTO A UNA CAPA NORMAL. Las capas de siempre son imágenes a
// pantalla completa que se apilan; una capa de sprite es un bicho pequeño
// colocado en un sitio concreto del plano, y encima con varios fotogramas que
// van rotando. Por eso lleva posición, tamaño y velocidad: sin eso, un pájaro
// de 44×80 estirado a todo el cuadro es un pájaro del tamaño de una casa.
//
// DOS ESPACIOS, A PROPÓSITO. Lo normal es que el sprite viva sobre el lienzo:
// así un meteoro puede ir de A a B sin que un paneo de cámara le tuerza la
// trayectoria. Cuando sí tiene que formar parte del decorado, «capa» conserva
// el comportamiento 2.5D anterior y hereda paralaje, zoom y transiciones.
//
// Y AHORA SÍ SE ANIMA EL DIBUJO. Hasta ahora un pájaro con «deriva» cruzaba el
// cuadro con las alas congeladas —está escrito como limitación en
// movimiento-capa.ts—. Con los fotogramas de la biblioteca, cruza aleteando.

import type {
  AccionSprite, AnclajeSprite, DireccionSprite, VistaSprite,
} from "./biblioteca";

export type EspacioSprite = "pantalla" | "capa";

export interface TrayectoriaSprite {
  /** Destino absoluto, en proporción del ancho y alto del lienzo. */
  x: number;
  y: number;
  /** Tiempo de A a B. */
  segundos: number;
  /** Al llegar a B vuelve a A y repite. Útil si ambos puntos están fuera. */
  bucle?: boolean;
}

/** Un tramo declarativo de una ruta. También se puede escribir desde la IA. */
export interface PasoRutaSprite {
  /** mover interpola; pausa conserva el punto; voltear cambia el sentido. */
  tipo: "mover" | "pausa" | "voltear";
  /** Destino del tramo. Solo se usa al mover. */
  x?: number;
  y?: number;
  /** Duración del movimiento, la espera o el giro (normalmente 0.1 s). */
  segundos: number;
  /** Sentido durante este paso. En voltear, si falta, invierte el anterior. */
  espejo?: boolean;
}

export interface RutaSprite {
  pasos: PasoRutaSprite[];
  bucle?: boolean;
}

export interface SpriteEnCapa {
  /** El id en la biblioteca, si vino de ahí. Sirve para volver a bajarlo. */
  id?: string;
  fotogramas: number;
  /** Fotogramas por segundo del ciclo. */
  fps: number;
  /** Cómo está dibujado el PNG original; permite orientar su ruta sin adivinar. */
  vista?: VistaSprite;
  direccionBase?: DireccionSprite;
  accion?: AccionSprite;
  /** `pies` interpreta x/y como el punto donde pisa, no como el centro. */
  anclaje?: AnclajeSprite;
  /** Superficie semántica del mapa a la que se ajustó su ruta. */
  superficieId?: string;
  /** Posición 0..1: centro visual o punto de apoyo, según `anclaje`. */
  x: number;
  y: number;
  /** Alto del bicho como fracción del alto del plano. 0.1 = una décima. */
  alto: number;
  /**
   * pantalla: independiente de paneos, zooms y fundidos de cámara.
   * capa: se transforma junto con su capa, como en los montajes antiguos.
   */
  espacio: EspacioSprite;
  /** Recorrido absoluto desde (x,y) hasta este destino. */
  trayectoria?: TrayectoriaSprite;
  /** Secuencia de movimientos, pausas y giros. Tiene prioridad sobre trayectoria. */
  ruta?: RutaSprite;
  /** Voltearlo para que mire al otro lado. */
  espejo?: boolean;
  /** Reiniciar la ruta al reproducir la cámara/transición. Por defecto sí. */
  sincronizar?: boolean;
}

const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const num = (v: unknown, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
};

/**
 * Deja los valores donde no rompan nada.
 *
 * La posición se deja salirse un poco del plano a propósito (−0.5..1.5): un
 * pájaro con «deriva» tiene que poder empezar fuera del cuadro y entrar, y si
 * se acotara a 0..1 aparecería de golpe en el borde.
 */
export function normalizarSprite(s: any): SpriteEnCapa | undefined {
  if (!s || typeof s !== "object") return undefined;
  const fotogramas = Math.round(acotar(num(s.fotogramas, 0), 1, 24));
  if (!fotogramas) return undefined;
  const spr: SpriteEnCapa = {
    fotogramas,
    fps: Math.round(acotar(num(s.fps, 10), 1, 60)),
    vista: ["lateral", "frontal", "trasera", "superior", "libre"].includes(s.vista)
      ? s.vista : "lateral",
    direccionBase: ["derecha", "izquierda", "frente", "espaldas", "arriba", "abajo", "ninguna"].includes(s.direccionBase)
      ? s.direccionBase : "derecha",
    accion: ["quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro"].includes(s.accion)
      ? s.accion : "otro",
    anclaje: s.anclaje === "pies" ? "pies" : "centro",
    x: acotar(num(s.x, 0.5), -0.5, 1.5),
    y: acotar(num(s.y, 0.5), -0.5, 1.5),
    alto: acotar(num(s.alto, 0.2), 0.01, 2),
    // Los ZIP creados antes de existir este campo seguían la cámara. Se
    // conservan así al importarlos; los sprites NUEVOS sí se crean en pantalla.
    espacio: s.espacio === "pantalla" ? "pantalla" : "capa",
  };
  if (typeof s.id === "string" && s.id) spr.id = s.id;
  if (typeof s.superficieId === "string" && s.superficieId) spr.superficieId = s.superficieId.slice(0, 80);
  if (s.espejo) spr.espejo = true;
  // Los recorridos de las versiones anteriores ya se reiniciaban al reproducir
  // la cámara. Ausente, por tanto, significa sincronizado.
  spr.sincronizar = s.sincronizar !== false;
  if (s.trayectoria && typeof s.trayectoria === "object") {
    spr.trayectoria = {
      x: acotar(num(s.trayectoria.x, spr.x), -0.5, 1.5),
      y: acotar(num(s.trayectoria.y, spr.y), -0.5, 1.5),
      segundos: acotar(num(s.trayectoria.segundos, 4), 0.1, 120),
      ...(s.trayectoria.bucle ? { bucle: true } : {}),
    };
  }
  if (s.ruta && typeof s.ruta === "object" && Array.isArray(s.ruta.pasos)) {
    const pasos = s.ruta.pasos.slice(0, 24).flatMap((p: any): PasoRutaSprite[] => {
      if (!p || typeof p !== "object" || !["mover", "pausa", "voltear"].includes(p.tipo)) return [];
      const comun = {
        tipo: p.tipo,
        segundos: acotar(num(p.segundos, p.tipo === "mover" ? 4 : p.tipo === "pausa" ? 1 : 0.1), 0.1, 120),
        ...(typeof p.espejo === "boolean" ? { espejo: p.espejo } : {}),
      } as PasoRutaSprite;
      if (p.tipo === "mover") {
        comun.x = acotar(num(p.x, spr.x), -0.5, 1.5);
        comun.y = acotar(num(p.y, spr.y), -0.5, 1.5);
      }
      return [comun];
    });
    if (pasos.length) spr.ruta = { pasos, ...(s.ruta.bucle ? { bucle: true } : {}) };
  }
  return spr;
}

export interface EstadoSprite {
  x: number;
  y: number;
  espejo: boolean;
  /** Índice del paso activo; −1 cuando no hay ruta por pasos. */
  paso: number;
  avance: number;
  terminado: boolean;
}

/** Duración espacial total; no altera el ciclo interno de fotogramas. */
export function duracionRutaSprite(spr: SpriteEnCapa) {
  if (spr.ruta?.pasos.length) {
    return spr.ruta.pasos.reduce((total, p) => total + Math.max(0.1, p.segundos), 0);
  }
  return spr.trayectoria ? Math.max(0.1, spr.trayectoria.segundos) : 0;
}

/** Posición, sentido y paso del sprite en un instante. */
export function estadoSpriteEn(spr: SpriteEnCapa, t: number): EstadoSprite {
  const pasos = spr.ruta?.pasos;
  if (pasos?.length) {
    const total = duracionRutaSprite(spr);
    const enBucle = !!spr.ruta?.bucle;
    let tiempo = Math.max(0, t);
    if (enBucle && total > 0) tiempo %= total;

    let x = spr.x;
    let y = spr.y;
    let espejo = !!spr.espejo;
    for (let i = 0; i < pasos.length; i++) {
      const paso = pasos[i];
      const dur = Math.max(0.1, paso.segundos);
      const sentido = typeof paso.espejo === "boolean"
        ? paso.espejo
        : paso.tipo === "voltear" ? !espejo : espejo;
      if (tiempo < dur) {
        const avance = paso.tipo === "mover" ? tiempo / dur : 0;
        return {
          x: paso.tipo === "mover" ? x + ((paso.x ?? x) - x) * avance : x,
          y: paso.tipo === "mover" ? y + ((paso.y ?? y) - y) * avance : y,
          espejo: sentido,
          paso: i,
          avance,
          terminado: false,
        };
      }
      tiempo -= dur;
      if (paso.tipo === "mover") {
        x = paso.x ?? x;
        y = paso.y ?? y;
      }
      espejo = sentido;
    }
    return { x, y, espejo, paso: pasos.length - 1, avance: 1, terminado: !enBucle };
  }

  const tr = spr.trayectoria;
  if (!tr) {
    return { x: spr.x, y: spr.y, espejo: !!spr.espejo, paso: -1, avance: 0, terminado: false };
  }
  const dur = Math.max(0.1, tr.segundos);
  const tiempo = Math.max(0, t);
  const p = tr.bucle ? (tiempo % dur) / dur : Math.min(1, tiempo / dur);
  return {
    x: spr.x + (tr.x - spr.x) * p,
    y: spr.y + (tr.y - spr.y) * p,
    espejo: !!spr.espejo,
    paso: -1,
    avance: p,
    terminado: !tr.bucle && tiempo >= dur,
  };
}

/** Posición conservada para consumidores y proyectos anteriores. */
export function posicionSprite(spr: SpriteEnCapa, t: number) {
  const { x, y } = estadoSpriteEn(spr, t);
  return { x, y };
}

/** Ausente solo en objetos viejos aún no normalizados: esos seguían la cámara. */
export const spriteSigueCamara = (spr: SpriteEnCapa) => spr.espacio !== "pantalla";

/** Qué fotograma toca en el segundo `t`. */
export function fotogramaEn(spr: SpriteEnCapa, t: number): number {
  if (spr.fotogramas < 2) return 0;
  const i = Math.floor(t * spr.fps) % spr.fotogramas;
  return i < 0 ? i + spr.fotogramas : i;
}

/** El plano de una capa: dónde ha quedado el rectángulo completo, ya con cámara. */
export interface Plano {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/**
 * Dónde y de qué tamaño se pinta el bicho dentro de su plano.
 *
 * El alto manda y el ancho sale de la proporción del fotograma: al revés, un
 * pájaro ancho y otro estrecho pedidos «del mismo tamaño» saldrían con alturas
 * distintas, que es lo que se nota.
 */
export function cajaSprite(
  spr: SpriteEnCapa,
  anchoFot: number,
  altoFot: number,
  plano: Plano,
  t = 0,
) {
  const pos = posicionSprite(spr, t);
  const dh = plano.h * spr.alto;
  const dw = altoFot > 0 ? dh * (anchoFot / altoFot) : dh;
  return {
    dx: plano.x0 + pos.x * plano.w - dw / 2,
    dy: plano.y0 + pos.y * plano.h - (spr.anclaje === "pies" ? dh : dh / 2),
    dw,
    dh,
  };
}

/**
 * Pinta un fotograma de la tira.
 *
 * La tira no se parte nunca: se dibuja el trozo que toca con el `drawImage` de
 * nueve argumentos. Una imagen en memoria en vez de doce, y ni un canvas
 * intermedio.
 */
export function pintarSprite(
  c: CanvasRenderingContext2D,
  tira: CanvasImageSource,
  spr: SpriteEnCapa,
  anchoFot: number,
  altoFot: number,
  i: number,
  caja: { dx: number; dy: number; dw: number; dh: number },
) {
  const sx = i * anchoFot;
  if (spr.espejo) {
    c.save();
    // Voltear es escalar por −1 alrededor del centro del bicho. Hay que
    // trasladar antes, o el sprite se va al otro lado de la pantalla.
    c.translate(caja.dx + caja.dw / 2, 0);
    c.scale(-1, 1);
    c.drawImage(tira, sx, 0, anchoFot, altoFot, -caja.dw / 2, caja.dy, caja.dw, caja.dh);
    c.restore();
    return;
  }
  c.drawImage(tira, sx, 0, anchoFot, altoFot, caja.dx, caja.dy, caja.dw, caja.dh);
}

/** Referencia compacta para el JSON declarativo que puede escribir la IA. */
export function rutasSpriteParaIA() {
  return {
    posicionInicial: "spr.x y spr.y (−0.5..1.5); con anclaje pies, y es el suelo bajo sus pies; con centro, es el centro visual",
    semantica: "vista + direccionBase describen el PNG; accion + superficieId describen cómo se usa en la escena",
    tamano: "spr.alto (0.01..2; proporción del alto del lienzo)",
    ruta: {
      bucle: "opcional",
      pasos: [
        { tipo: "mover", x: 1.2, y: 0.5, segundos: 4, espejo: false },
        { tipo: "pausa", segundos: 1 },
        { tipo: "voltear", segundos: 0.1 },
        { tipo: "mover", x: -0.2, y: 0.5, segundos: 4 },
      ],
    },
    sincronizar: "true reinicia la ruta al reproducir cámara/transiciones; false usa su reloj independiente",
    compatibilidad: "spr.trayectoria sigue admitida para un único recorrido A→B",
  };
}
