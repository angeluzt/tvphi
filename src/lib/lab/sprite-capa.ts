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

/**
 * Otra animación del MISMO personaje, lista para adoptarla a mitad de ruta.
 *
 * QUÉ RESUELVE. Un actor era una tira de fotogramas y se acabó: si caminaba,
 * caminaba todo el rato. Un personaje que llega andando, se para y saluda
 * necesitaba TRES capas con la misma criatura, encendidas y apagadas a mano en
 * los momentos exactos —imposible de cuadrar y un desastre al mover la ruta—.
 *
 * Aquí la capa lleva sus animaciones colgadas y la ruta dice cuándo cambia.
 * Cada una tiene sus propios fotogramas y su propio fps porque un ciclo de
 * correr y uno de estar quieto no duran lo mismo ni de lejos.
 */
export interface AnimLigada {
  /** Nombre corto con el que la ruta la llama. Único dentro de la capa. */
  clave: string;
  /** Id de la animación en la biblioteca, para volver a bajar su tira. */
  id?: string;
  fotogramas: number;
  fps: number;
}

/** Un tramo declarativo de una ruta. También se puede escribir desde la IA. */
export interface PasoRutaSprite {
  /**
   * mover interpola; pausa conserva el punto; voltear cambia el sentido;
   * cambiar sustituye la animación por otra de las ligadas.
   */
  tipo: "mover" | "pausa" | "voltear" | "cambiar";
  /** Destino del tramo. Solo se usa al mover. */
  x?: number;
  y?: number;
  /** Duración del movimiento, la espera o el giro (normalmente 0.1 s). */
  segundos: number;
  /** mover: lineal conserva pasos constantes; suave acelera y frena. */
  suavizado?: "lineal" | "suave";
  /** Sentido durante este paso. En voltear, si falta, invierte el anterior. */
  espejo?: boolean;
  /**
   * cambiar: a qué animación ligada se pasa. Cadena vacía vuelve a la de la
   * capa. Los pasos de mover y pausa también lo admiten, que es lo cómodo:
   * «vete allí CORRIENDO» en un solo paso en vez de dos.
   */
  anim?: string;
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
  /**
   * Otras animaciones del mismo personaje que la ruta puede activar.
   *
   * La tira de `fotogramas`/`fps` de arriba sigue siendo la de partida; estas
   * son las que se encadenan con pasos «cambiar».
   */
  anims?: AnimLigada[];
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
  // Las animaciones ligadas se normalizan ANTES que la ruta: un paso que llame
  // a una animación que no existe no debe quedarse guardado, o al reproducir el
  // actor desaparecería sin decir por qué.
  if (Array.isArray(s.anims)) {
    const vistas = new Set<string>();
    const anims: AnimLigada[] = [];
    for (const a of s.anims.slice(0, 8)) {
      if (!a || typeof a !== "object") continue;
      const clave = String(a.clave ?? "").trim().slice(0, 40);
      const fot = Math.round(acotar(num(a.fotogramas, 0), 1, 24));
      if (!clave || !fot || vistas.has(clave)) continue;
      vistas.add(clave);
      anims.push({
        clave,
        fotogramas: fot,
        fps: Math.round(acotar(num(a.fps, spr.fps), 1, 60)),
        ...(typeof a.id === "string" && a.id ? { id: a.id } : {}),
      });
    }
    if (anims.length) spr.anims = anims;
  }
  const claves = new Set((spr.anims ?? []).map((a) => a.clave));

  if (s.ruta && typeof s.ruta === "object" && Array.isArray(s.ruta.pasos)) {
    const pasos = s.ruta.pasos.slice(0, 24).flatMap((p: any): PasoRutaSprite[] => {
      if (!p || typeof p !== "object" || !["mover", "pausa", "voltear", "cambiar"].includes(p.tipo)) return [];
      // La cadena vacía es válida y significa «vuelve a la de la capa». Por eso
      // se distingue de «no lo han puesto», que no debe tocar la animación.
      const anim = typeof p.anim === "string" ? p.anim.trim().slice(0, 40) : undefined;
      const animOk = anim !== undefined && (anim === "" || claves.has(anim));
      // Un «cambiar» a una animación que no existe no es un paso: sería una
      // espera invisible que además descuadra el resto de los tiempos.
      if (p.tipo === "cambiar" && !animOk) return [];
      const comun = {
        tipo: p.tipo,
        segundos: acotar(
          num(p.segundos, p.tipo === "mover" ? 4 : p.tipo === "pausa" ? 1 : 0.1),
          p.tipo === "cambiar" ? 0 : 0.1,
          120,
        ),
        ...(p.tipo === "mover" && p.suavizado === "suave" ? { suavizado: "suave" as const } : {}),
        ...(typeof p.espejo === "boolean" ? { espejo: p.espejo } : {}),
        ...(animOk ? { anim } : {}),
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

/** Los fotogramas y el fps que tocan según la animación activa. */
export function animDeSprite(spr: SpriteEnCapa, clave: string): { fotogramas: number; fps: number } {
  const a = clave ? spr.anims?.find((x) => x.clave === clave) : undefined;
  return a ? { fotogramas: a.fotogramas, fps: a.fps } : { fotogramas: spr.fotogramas, fps: spr.fps };
}

export interface EstadoSprite {
  x: number;
  y: number;
  espejo: boolean;
  /** Índice del paso activo; −1 cuando no hay ruta por pasos. */
  paso: number;
  avance: number;
  terminado: boolean;
  /** Animación ligada activa. Cadena vacía = la de la capa. */
  anim: string;
  /** Segundos desde que se adoptó esa animación, para no cortarle el ciclo. */
  desdeAnim: number;
}

/**
 * Lo que dura un paso.
 *
 * Un «cambiar» de cero segundos es legítimo —es un cambio instantáneo, no una
 * espera— y por eso no comparte el mínimo de 0.1 con los demás: si lo
 * compartiera, tres cambios encadenados meterían tres décimas de parón que
 * nadie ha pedido y descuadrarían la ruta con la cámara.
 */
const durPaso = (p: PasoRutaSprite) =>
  p.tipo === "cambiar" ? Math.max(0, p.segundos) : Math.max(0.1, p.segundos);

/** Duración espacial total; no altera el ciclo interno de fotogramas. */
export function duracionRutaSprite(spr: SpriteEnCapa) {
  if (spr.ruta?.pasos.length) {
    return spr.ruta.pasos.reduce((total, p) => total + durPaso(p), 0);
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
    // La animación activa y CUÁNDO empezó. El reloj propio importa: si el ciclo
    // de fotogramas siguiera contando desde el principio de la ruta, al pasar
    // de «andar» (6 cuadros) a «saludar» (3) el nuevo empezaría por un cuadro
    // cualquiera y el cambio se vería como un tirón.
    let anim = "";
    let inicioAnim = 0;
    let transcurrido = 0;
    for (let i = 0; i < pasos.length; i++) {
      const paso = pasos[i];
      const dur = durPaso(paso);
      const sentido = typeof paso.espejo === "boolean"
        ? paso.espejo
        : paso.tipo === "voltear" ? !espejo : espejo;
      // El cambio de animación es lo PRIMERO del paso: si el paso es «vete
      // allí corriendo», corre desde el primer fotograma, no desde el último.
      if (paso.anim !== undefined && paso.anim !== anim) {
        anim = paso.anim;
        inicioAnim = transcurrido;
      }
      if (tiempo < dur) {
        const crudo = paso.tipo === "mover" ? tiempo / dur : 0;
        const avance = paso.tipo === "mover" && paso.suavizado === "suave"
          ? crudo * crudo * (3 - 2 * crudo)
          : crudo;
        return {
          x: paso.tipo === "mover" ? x + ((paso.x ?? x) - x) * avance : x,
          y: paso.tipo === "mover" ? y + ((paso.y ?? y) - y) * avance : y,
          espejo: sentido,
          paso: i,
          avance,
          terminado: false,
          anim,
          desdeAnim: transcurrido + tiempo - inicioAnim,
        };
      }
      tiempo -= dur;
      transcurrido += dur;
      if (paso.tipo === "mover") {
        x = paso.x ?? x;
        y = paso.y ?? y;
      }
      espejo = sentido;
    }
    return {
      x, y, espejo, paso: pasos.length - 1, avance: 1, terminado: !enBucle,
      anim, desdeAnim: transcurrido - inicioAnim,
    };
  }

  const tr = spr.trayectoria;
  if (!tr) {
    return {
      x: spr.x, y: spr.y, espejo: !!spr.espejo, paso: -1, avance: 0, terminado: false,
      anim: "", desdeAnim: Math.max(0, t),
    };
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
    anim: "",
    desdeAnim: tiempo,
  };
}

/** Posición conservada para consumidores y proyectos anteriores. */
export function posicionSprite(spr: SpriteEnCapa, t: number) {
  const { x, y } = estadoSpriteEn(spr, t);
  return { x, y };
}

/** Ausente solo en objetos viejos aún no normalizados: esos seguían la cámara. */
export const spriteSigueCamara = (spr: SpriteEnCapa) => spr.espacio !== "pantalla";

/** Qué fotograma toca a los `t` segundos de una tira de `fotogramas` a `fps`. */
export function fotogramaDeAnim(fotogramas: number, fps: number, t: number): number {
  if (fotogramas < 2) return 0;
  const i = Math.floor(t * fps) % fotogramas;
  return i < 0 ? i + fotogramas : i;
}

/** Qué fotograma toca en el segundo `t`, con la tira de partida de la capa. */
export function fotogramaEn(spr: SpriteEnCapa, t: number): number {
  return fotogramaDeAnim(spr.fotogramas, spr.fps, t);
}

/**
 * Todo lo que hace falta para pintar el sprite en un instante: qué tira, qué
 * trozo de ella y hacia dónde mira. Lo usan la vista previa y la exportación,
 * así que vive aquí y no en el dibujante.
 */
export function fotogramaActivo(spr: SpriteEnCapa, t: number) {
  const estado = estadoSpriteEn(spr, t);
  const { fotogramas, fps } = animDeSprite(spr, estado.anim);
  return {
    estado,
    anim: estado.anim,
    fotogramas,
    indice: fotogramaDeAnim(fotogramas, fps, estado.desdeAnim),
  };
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
        { tipo: "mover", x: 1.2, y: 0.5, segundos: 4, suavizado: "lineal", espejo: false },
        { tipo: "pausa", segundos: 1 },
        { tipo: "voltear", segundos: 0.1 },
        { tipo: "mover", x: -0.2, y: 0.5, segundos: 4 },
      ],
    },
    animaciones: {
      anims: "otras animaciones del MISMO personaje, cada una con su clave, fotogramas y fps",
      cambiar: "paso {tipo:'cambiar', anim:'saludar', segundos:0} para adoptarla a mitad de ruta; segundos 0 es instantáneo y no alarga nada",
      enElPaso: "un mover o un pausa también admite anim: «vete allí corriendo» en un solo paso",
      volver: "anim:'' devuelve la animación de partida de la capa",
      ojo: "solo valen claves declaradas en anims; el ciclo de la nueva empieza siempre por su primer cuadro",
    },
    sincronizar: "true reinicia la ruta al reproducir cámara/transiciones; false usa su reloj independiente",
    espacio: "capa si usa suelo/vía/agua y debe conservar el apoyo durante zoom/paralaje; pantalla solo para ruta absoluta que ignora cámara",
    compatibilidad: "spr.trayectoria sigue admitida para un único recorrido A→B",
  };
}
