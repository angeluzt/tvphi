// La animación entera repartida en pistas sobre un eje de tiempo común.
//
// EL PROBLEMA. Hay tres relojes distintos corriendo a la vez y ninguno se ve:
// la COLA de cámara (pasos en milisegundos), la RUTA de cada sprite (pasos en
// segundos, y con bucle propio) y los EFECTOS (que hoy no tienen tiempo: están
// encendidos siempre). Con los tres en listas separadas no hay forma de
// contestar «¿qué pasa en el segundo 7?», que es justo lo que hace falta para
// encadenar un sprite con una transición o para saber por qué algo se ve antes
// de tiempo.
//
// Esto no dibuja nada ni sabe de React: entra el estado y sale dónde cae cada
// cosa. Lo que se dibuja encima es una consecuencia.
//
// LOS DOS RELOJES QUE NO ENCAJAN, y cómo se resuelve. La cámara marca el largo
// de la escena; un sprite puede durar menos —y entonces se queda quieto al
// acabar— o durar más, y entonces su ruta se ve CORTADA, no estirada: estirarla
// mentiría sobre cuándo llega a cada sitio. Si la ruta tiene bucle, se repite
// hasta llenar y se marca cada vuelta, que es lo que deja ver de un vistazo que
// el ciclo no cuadra con la cámara.

/** Un tramo con principio y fin dentro de la escena. */
export interface Bloque {
  id: string;
  /** Milisegundos desde el principio de la escena. */
  desde: number;
  hasta: number;
  etiqueta: string;
  /** Para pintarlo distinto y para saber qué abre al pulsarlo. */
  clase: "camara" | "mover" | "pausa" | "voltear" | "cambiar" | "efecto";
  /** Índice dentro de su lista de origen, para poder editarlo. */
  indice: number;
  /** Repetición del bucle a la que pertenece. 0 es la primera vuelta. */
  vuelta?: number;
  /** Detalle corto: la distancia, el destino, a qué animación cambia. */
  nota?: string;
}

/** Un instante señalado: un fundido, un cambio de sprite, el fin de un ciclo. */
export interface Marca {
  ms: number;
  etiqueta: string;
  clase: "fundido" | "cambio" | "vuelta" | "fin";
}

export interface Pista {
  id: string;
  nombre: string;
  clase: "camara" | "sprite" | "efectos";
  bloques: Bloque[];
  marcas: Marca[];
  /** El sprite o la capa de la que salió, para poder seleccionarla. */
  refId?: string;
}

export interface LineaTiempo {
  /** Largo total, que lo manda la cámara. */
  totalMs: number;
  pistas: Pista[];
}

/** Lo mínimo que se necesita de un paso de cámara. */
export interface PasoCamaraLT {
  id: string;
  durMs: number;
  mov: string;
  mov2?: string;
  distancia?: number;
  /** Fundido de capa que dispara este paso, si lo hay. */
  fade?: { accion: string; capa?: string };
}

export interface PasoRutaLT {
  tipo: "mover" | "pausa" | "voltear" | "cambiar";
  segundos: number;
  x?: number;
  y?: number;
  /** Solo en «cambiar»: a qué animación ligada salta. */
  anim?: string;
}

export interface SpriteLT {
  /** Id de la capa que lo lleva. */
  capaId: string;
  nombre: string;
  pasos: PasoRutaLT[];
  bucle?: boolean;
}

export interface EfectoLT {
  id: string;
  nombre: string;
}

const MS = 1000;
/** Ni un bloque de cero: por debajo de esto no se puede ni pulsar. */
const MINIMO_MS = 80;

/** Cuánto dura la cola de cámara. Es lo que fija el largo de la escena. */
export function duracionCamara(cola: PasoCamaraLT[]): number {
  return cola.reduce((a, p) => a + Math.max(0, p.durMs), 0);
}

/** Y cuánto dura una vuelta completa de la ruta de un sprite. */
export function duracionRuta(pasos: PasoRutaLT[]): number {
  return pasos.reduce((a, p) => a + Math.max(0, p.segundos) * MS, 0);
}

const NOMBRE_MOV: Record<string, string> = {
  quieto: "Quieto", suave: "Suave", acercar: "Acercar", alejar: "Alejar",
  atravesar: "Atravesar", diagonal: "Diagonal", orbita: "Órbita",
  izq: "← Izquierda", der: "Derecha →", arriba: "↑ Arriba", abajo: "↓ Abajo",
  centrar: "Al centro", esperar: "Esperar",
};

export const nombreMov = (m: string) => NOMBRE_MOV[m] ?? m;

/**
 * La pista de la cámara.
 *
 * Cada paso es un bloque, y los fundidos de capa salen como MARCAS en vez de
 * como bloques propios: un fundido no ocupa tiempo por su cuenta, pasa dentro
 * del tramo. Dibujarlo como bloque haría creer que la cámara se para a hacerlo.
 */
export function pistaCamara(cola: PasoCamaraLT[]): Pista {
  const bloques: Bloque[] = [];
  const marcas: Marca[] = [];
  let t = 0;
  cola.forEach((p, i) => {
    const dur = Math.max(MINIMO_MS, p.durMs);
    bloques.push({
      id: p.id || `cam-${i}`,
      desde: t,
      hasta: t + dur,
      etiqueta: p.mov2 ? `${nombreMov(p.mov)} + ${nombreMov(p.mov2)}` : nombreMov(p.mov),
      clase: "camara",
      indice: i,
      nota: p.distancia != null ? `${p.distancia}%` : undefined,
    });
    if (p.fade && p.fade.accion && p.fade.accion !== "nada") {
      marcas.push({
        ms: t,
        etiqueta: p.fade.accion === "aparecer" ? "aparece capa" : "desaparece capa",
        clase: "fundido",
      });
    }
    t += dur;
  });
  return { id: "camara", nombre: "Cámara", clase: "camara", bloques, marcas };
}

/**
 * La pista de un sprite, recortada o repetida hasta llenar la escena.
 *
 * NO se estira para que cuadre. Una ruta de 4 s dentro de una escena de 10 no
 * dura 10: dura 4 y el bicho se queda donde llegó, que es lo que de verdad
 * pasa al reproducirlo. Estirarla pondría los destinos en un sitio distinto del
 * que se ve, y entonces la línea de tiempo mentiría justo donde más se mira.
 */
export function pistaSprite(s: SpriteLT, totalMs: number): Pista {
  const bloques: Bloque[] = [];
  const marcas: Marca[] = [];
  const vuelta = duracionRuta(s.pasos);

  if (!s.pasos.length || vuelta <= 0) {
    return { id: s.capaId, nombre: s.nombre, clase: "sprite", bloques, marcas, refId: s.capaId };
  }

  let t = 0, v = 0;
  // El tope de vueltas es una defensa, no una regla: una ruta de 0,1 s en bucle
  // dentro de una escena larga daría miles de bloques y colgaría el navegador.
  while (t < totalMs && v < 200) {
    s.pasos.forEach((p, i) => {
      if (t >= totalMs) return;
      const dur = Math.max(MINIMO_MS, Math.max(0, p.segundos) * MS);
      const hasta = Math.min(totalMs, t + dur);
      bloques.push({
        id: `${s.capaId}-v${v}-${i}`,
        desde: t,
        hasta,
        etiqueta: p.tipo === "mover" ? "Mover"
          : p.tipo === "pausa" ? "Pausa"
            : p.tipo === "voltear" ? "Voltear" : `→ ${p.anim || "otra"}`,
        clase: p.tipo,
        indice: i,
        vuelta: v,
        nota: p.tipo === "mover" && p.x != null
          ? `a ${p.x.toFixed(2)}${p.y != null ? `, ${p.y.toFixed(2)}` : ""}`
          : undefined,
      });
      // El cambio de sprite se señala aparte: es EL momento que hay que poder
      // encontrar, y dentro de un bloque de 0,1 s no se ve.
      if (p.tipo === "cambiar") {
        marcas.push({ ms: t, etiqueta: `cambia a ${p.anim || "otra"}`, clase: "cambio" });
      }
      t = hasta;
    });
    v++;
    if (!s.bucle) break;
    if (t < totalMs) marcas.push({ ms: t, etiqueta: `vuelta ${v + 1}`, clase: "vuelta" });
  }
  // Dónde se queda quieto, que es la otra pregunta que nadie puede contestar hoy.
  if (t < totalMs) marcas.push({ ms: t, etiqueta: "se queda quieto", clase: "fin" });

  return { id: s.capaId, nombre: s.nombre, clase: "sprite", bloques, marcas, refId: s.capaId };
}

/**
 * UNA PISTA POR EFECTO.
 *
 * Antes iban todos en la misma fila, y como ninguno tiene tiempo —el motor los
 * arranca en 0 y no los apaga nunca— los tres ocupaban la escena entera y se
 * dibujaban uno encima de otro: las etiquetas se pisaban y se leía
 * «Hlonjivasl yu pvéita(oltodass)». Con la lluvia y los pétalos a la vez no
 * había forma de saber cuántos efectos había, ni de pulsar uno concreto.
 *
 * Con una fila cada uno se leen, se seleccionan y se borran por separado, que
 * es lo mismo que ya podía hacerse con cada actor.
 *
 * Siguen ocupando el ancho completo a propósito: es lo que hace evidente que
 * todavía no se pueden temporizar, en vez de insinuar un principio y un fin que
 * el motor no respeta.
 */
export function pistaEfecto(efecto: EfectoLT, indice: number, totalMs: number): Pista {
  return {
    id: `efecto-${efecto.id}`,
    nombre: efecto.nombre,
    clase: "efectos",
    bloques: [{
      id: efecto.id,
      desde: 0,
      hasta: totalMs,
      etiqueta: efecto.nombre,
      clase: "efecto" as const,
      indice,
      nota: "toda la escena",
    }],
    marcas: [],
    refId: efecto.id,
  };
}

/** Todo junto, en el orden en que se lee: cámara arriba, efectos abajo. */
export function lineaDeTiempo(
  cola: PasoCamaraLT[],
  sprites: SpriteLT[],
  efectos: EfectoLT[],
): LineaTiempo {
  // Sin cámara no hay escena que medir, pero puede haber sprites: entonces
  // manda la ruta más larga. Si no, la línea saldría de ancho cero y no se
  // podría ni pulsar para colocar el primer paso.
  const totalMs = Math.max(
    duracionCamara(cola),
    ...sprites.map((s) => duracionRuta(s.pasos)),
    MINIMO_MS,
  );
  return {
    totalMs,
    pistas: [
      pistaCamara(cola),
      ...sprites.map((s) => pistaSprite(s, totalMs)),
      ...efectos.map((e, i) => pistaEfecto(e, i, totalMs)),
    ],
  };
}

/** Qué bloque de una pista está sonando en este milisegundo. */
export function bloqueEn(pista: Pista, ms: number): Bloque | null {
  return pista.bloques.find((b) => ms >= b.desde && ms < b.hasta) ?? null;
}

/**
 * Los cortes donde tiene sentido saltar: principio de cada bloque y cada marca.
 *
 * Sirve para que las flechas del transporte salten de suceso en suceso en vez
 * de avanzar un tiempo fijo. Buscar «el momento en que cambia el sprite»
 * arrastrando un deslizador es justo lo que hoy no se puede hacer.
 */
export function cortes(lt: LineaTiempo): number[] {
  const set = new Set<number>([0, lt.totalMs]);
  for (const p of lt.pistas) {
    for (const b of p.bloques) set.add(Math.round(b.desde));
    for (const m of p.marcas) set.add(Math.round(m.ms));
  }
  return [...set].filter((n) => n >= 0 && n <= lt.totalMs).sort((a, b) => a - b);
}

/** El corte anterior o siguiente al punto actual, para las flechas. */
export function saltar(lt: LineaTiempo, ms: number, dir: -1 | 1): number {
  const c = cortes(lt);
  // La holgura evita quedarse pegado: sin ella, «anterior» devuelve el mismo
  // corte en el que ya estás y el botón parece roto.
  const holgura = 30;
  if (dir > 0) return c.find((x) => x > ms + holgura) ?? lt.totalMs;
  return [...c].reverse().find((x) => x < ms - holgura) ?? 0;
}

/** «1:04.5», para las etiquetas del eje. */
export function reloj(ms: number): string {
  const t = Math.max(0, ms) / MS;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${s.toFixed(1)}s`;
}
