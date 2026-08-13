import {
  VFX, vfxDefaults, type VfxInput, type VfxKind, type VfxShape,
} from "@/lib/story/vfx";
import { cajaDeObjeto } from "./geometria-mapa";

// Los efectos del motor, dentro del laboratorio.
//
// LO QUE PASABA. La IA lleva tres versiones devolviendo «efectos» en su
// respuesta, y viajaban dentro del ZIP del proyecto… pero NADIE los leía. La
// ruta los devolvía (route.ts), el tipo del ZIP los declaraba (montaje-zip.ts),
// y en medio no había ni un estado que los guardara ni una línea que los
// pintara. Se pagaba el token de pedirlos y se tiraban.
//
// EL MOTOR YA EXISTE: `VfxScene` (src/lib/story/vfx.ts) es el mismo que usan
// las historias, con sus dos mil líneas de partículas. Aquí no se reimplementa
// nada: se traduce lo que escribe la IA a lo que ese motor espera.
//
// LOS DOS ESPACIOS, que es la única decisión de verdad:
//   · «imagen»   → el efecto está PEGADO a un sitio de la escena. Una hoguera
//                  en el suelo tiene que moverse y crecer con la cámara, igual
//                  que la capa sobre la que está.
//   · «encuadre» → el efecto es del AIRE, no del sitio. La lluvia cae sobre la
//                  cámara: ni se desplaza al panear ni crece al acercarse.
// Confundirlos es lo que hace que una escena parezca un montaje: fuego que
// flota despegado del suelo, o lluvia que se agranda al hacer zoom.

export type EspacioEfecto = "imagen" | "encuadre";

export interface EfectoEscena {
  /** Identificador de ESTA instancia, no del tipo de efecto. */
  id: string;
  kind: VfxKind;
  shape: VfxShape;
  espacio: EspacioEfecto;
  /** Sitio en la escena, 0..1. Para «linea», el punto de partida. */
  x: number;
  y: number;
  /** Solo en «linea» / «libre»: el otro extremo. */
  x2: number;
  y2: number;
  /** A qué distancia está, para que la cámara lo mueva como a una capa. */
  depth: number;
  colorHex: string;
  params: Record<string, number>;
  /**
   * Cuándo suena, en segundos desde que arranca la escena.
   *
   * Sin esto los efectos eran continuos: el motor los encendía en 0 y no los
   * apagaba nunca, así que una explosión duraba tanto como el capítulo y no
   * había forma de decir «el humo empieza cuando llega el gato». Ausentes =
   * toda la escena, que es como se comportaba antes y como siguen los que ya
   * están guardados.
   */
  desde?: number;
  hasta?: number;
  /**
   * Id de la forma del mapa sobre la que va, si el modelo la nombró.
   *
   * Se guarda además de x/y para poder RECOLOCARLO: si luego se arrastra el
   * agua, el efecto que iba encima puede volver a su sitio en vez de quedarse
   * flotando donde estaba el agua antes.
   */
  ancla?: string;
}

const KINDS = new Set(VFX.map((v) => v.id as string));
const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const num = (v: unknown, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
};

/** El color por defecto del efecto, o blanco si no usa color. */
function colorDe(kind: VfxKind, pedido: unknown): string {
  if (typeof pedido === "string" && /^#[0-9a-f]{6}$/i.test(pedido)) return pedido;
  return VFX.find((v) => v.id === kind)?.color ?? "#ffffff";
}

/** La forma pedida si el efecto la admite; si no, la primera que admita. */
/**
 * Lo que CAE DEL CIELO sobre toda la escena.
 *
 * Estos no son emisores: son tiempo atmosférico. Pedidos como «punto» salen
 * por un agujero, y eso es exactamente lo que se veía —«la lluvia es un chorro
 * raro, los pétalos igual»—. El modelo los pide como punto a menudo porque
 * piensa «cae sobre el árbol»; da igual lo que piense: la lluvia cae sobre el
 * cuadro entero o no es lluvia.
 */
const CAEN_DEL_CIELO = new Set<VfxKind>(["lluvia", "nieve", "ceniza", "hojas"]);

function formaDe(kind: VfxKind, pedida: unknown): VfxShape {
  const spec = VFX.find((v) => v.id === kind);
  if (!spec) return "punto";
  // El tiempo atmosférico no se negocia: siempre de arriba y de lado a lado.
  if (CAEN_DEL_CIELO.has(kind)) return "arriba";
  const f = String(pedida ?? "").trim() as VfxShape;
  // Un efecto pedido con una forma que no admite no se descarta: se le pone la
  // suya. Descartarlo dejaría la escena sin el efecto por un detalle que el
  // modelo no tenía por qué acertar.
  return spec.shapes.includes(f) ? f : spec.shapes[0];
}

/**
 * La franja de arriba, de lado a lado.
 *
 * Un efecto «arriba» describe un BORDE, no un sitio: sus dos extremos son las
 * dos esquinas de arriba. Lo que llegaba del modelo era un punto —x, y— y los
 * dos extremos acababan pegados, así que la lluvia salía toda del mismo agujero
 * en mitad del cuadro. El sitio que diga el modelo aquí no aporta nada: la
 * franja es siempre la misma.
 */
/**
 * ¿Está sonando este efecto en el segundo `t`?
 *
 * Un efecto sin tiempo suena siempre. Y `hasta` sin `desde` —o al revés— vale:
 * son «hasta el segundo 4» y «a partir del 4», que es como lo diría cualquiera.
 */
export function efectoActivo(
  e: { desde?: number; hasta?: number },
  t: number,
): boolean {
  if (e.desde !== undefined && t < e.desde) return false;
  if (e.hasta !== undefined && t >= e.hasta) return false;
  return true;
}

export function franjaDeArriba() {
  return { x: 0, y: -0.02, x2: 1, y2: -0.02 };
}

/**
 * Lee lo que devuelve la IA y lo deja utilizable.
 *
 * Es deliberadamente tolerante: acepta tanto la forma corta que se le pide
 * —{id:"humo", espacio:"imagen", x, y, escala}— como una completa con nodos y
 * ajustes. Lo único innegociable es que el «id» exista en el catálogo: un
 * efecto inventado no se puede pintar, y colarlo daría un fallo en el bucle de
 * dibujo en vez de un aviso legible.
 */
export function normalizarEfectos(crudo: unknown): {
  efectos: EfectoEscena[];
  avisos: string[];
} {
  const avisos: string[] = [];
  if (!Array.isArray(crudo)) return { efectos: [], avisos };

  const efectos: EfectoEscena[] = [];
  for (const [i, item] of crudo.slice(0, 24).entries()) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;

    // «kind» es lo correcto, pero el prompt del laboratorio usa «id» para el
    // tipo. Se aceptan los dos y gana el explícito.
    const tipo = String(o.kind ?? o.id ?? "").trim().toLowerCase();
    if (!KINDS.has(tipo)) {
      avisos.push(`«${tipo || "sin nombre"}» no está en el catálogo de efectos y se ignora.`);
      continue;
    }
    const kind = tipo as VfxKind;
    const shape = formaDe(kind, o.shape ?? o.forma);

    // Los nodos pueden venir explícitos; si no, se arma uno con x/y.
    const nodo = Array.isArray(o.nodes) && o.nodes[0] && typeof o.nodes[0] === "object"
      ? o.nodes[0] as Record<string, unknown>
      : null;
    const enFranja = shape === "arriba";
    const franja = franjaDeArriba();
    const x = enFranja ? franja.x : acotar(num(nodo?.x ?? o.x, 0.5), -0.5, 1.5);
    const y = enFranja ? franja.y : acotar(num(nodo?.y ?? o.y, 0.5), -0.5, 1.5);
    const x2 = enFranja ? franja.x2 : acotar(num(nodo?.x2 ?? o.x2, x), -0.5, 1.5);
    const y2 = enFranja ? franja.y2 : acotar(num(nodo?.y2 ?? o.y2, y), -0.5, 1.5);

    // «escala» es el mando que se le ofrece al modelo: se traduce a los ajustes
    // de tamaño y cantidad del efecto, que es lo que el motor entiende.
    const params = { ...vfxDefaults(kind) };
    if (o.params && typeof o.params === "object") {
      for (const [k, v] of Object.entries(o.params as Record<string, unknown>)) {
        const spec = VFX.find((s) => s.id === kind)?.params.find((p) => p.key === k);
        if (spec) params[k] = acotar(num(v, params[k] ?? 1), spec.min, spec.max);
      }
    }
    const escala = num(o.escala, 0);
    if (escala > 0) {
      const spec = VFX.find((s) => s.id === kind);
      for (const clave of ["size", "intensity"]) {
        const p = spec?.params.find((q) => q.key === clave);
        if (p) params[clave] = acotar((params[clave] ?? 1) * (escala * 2), p.min, p.max);
      }
    }

    const espacio: EspacioEfecto = o.espacio === "encuadre" ? "encuadre"
      // La lluvia, la nieve y la niebla son del aire por naturaleza: aunque el
      // modelo diga «imagen», pegarlas a un sitio se ve mal siempre.
      : shape === "arriba" ? "encuadre"
        : "imagen";

    const seg = (v: unknown) => {
      const n = num(v, Number.NaN);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : undefined;
    };
    const desde = seg(o.desde);
    const hastaCrudo = seg(o.hasta);
    // Un final antes del principio no se corrige a medias: se tira, porque un
    // efecto que acaba antes de empezar no suena nunca y nadie lo pidió así.
    const hasta = hastaCrudo !== undefined && desde !== undefined && hastaCrudo <= desde
      ? undefined
      : hastaCrudo;

    efectos.push({
      id: typeof o.instanciaId === "string" && o.instanciaId ? o.instanciaId : `fx${i + 1}-${kind}`,
      kind, shape, espacio, x, y, x2, y2,
      ...(desde !== undefined ? { desde } : {}),
      ...(hasta !== undefined ? { hasta } : {}),
      depth: acotar(num(o.depth, 0.35), 0, 1),
      colorHex: colorDe(kind, o.colorHex ?? o.color),
      params,
      ancla: typeof o.ancla === "string" && o.ancla ? o.ancla : undefined,
    });
  }
  return { efectos, avisos };
}

/**
 * Traduce un efecto a lo que come `VfxScene`.
 *
 * `pos` ya viene en coordenadas de PANTALLA (0..1 del lienzo): quien llama es
 * el que sabe dónde ha quedado ese punto de la escena después de aplicar la
 * cámara. Aquí no se sabe nada de cámaras a propósito.
 *
 * `start`/`end` cubren toda la reproducción: en el laboratorio no hay tomas con
 * principio y fin, se está mirando una escena viva. Con una ventana corta los
 * efectos se darían de baja a los pocos segundos y parecería que fallan.
 */
export function aEntradaVfx(
  e: EfectoEscena,
  pos: { x: number; y: number; x2: number; y2: number },
): VfxInput {
  return {
    id: e.id,
    kind: e.kind,
    shape: e.shape,
    nodes: [{ x: pos.x, y: pos.y, x2: pos.x2, y2: pos.y2 }],
    colorHex: e.colorHex,
    params: e.params,
    start: 0,
    end: 1e9,
  };
}

/**
 * La clave con la que `VfxScene` decide si tiene que empezar de cero.
 *
 * Tiene que cambiar cuando cambie QUÉ hay que simular, y NO cuando cambie
 * dónde se pinta: si la posición entrara aquí, mover la cámara reiniciaría
 * todas las partículas en cada fotograma y no se vería nada más que el primer
 * instante del efecto, una y otra vez.
 */
export const claveEfectos = (efectos: EfectoEscena[]) =>
  efectos.map((e) => `${e.id},${e.kind},${e.shape},${e.espacio}`).join("|") || "sin-efectos";

/** Para enseñarlo en la lista sin tener que abrir el catálogo. */
export const nombreEfecto = (kind: VfxKind) =>
  VFX.find((v) => v.id === kind)?.label ?? kind;

// ---------------------------------------------------------------------------
// Anclar cada efecto a la forma del mapa a la que pertenece
// ---------------------------------------------------------------------------
//
// EL PROBLEMA MEDIDO. Los efectos salían todos en el centro del cuadro: una
// columna de luz atravesando la escena, la niebla en mitad del aire. La causa
// no era el motor, era que NADIE le decía dónde ponerlos. La instrucción que se
// le manda al modelo no mencionaba la forma («shape») ni ninguna regla de
// colocación, y aquí, sin coordenadas, se cae a x=0,5 y=0,5. Con eso, todo
// aterriza en el mismo punto y encima con la primera forma que el efecto
// admita, que en varios es una línea.
//
// POR QUÉ SE ANCLA A UN OBJETO Y NO SE PIDEN COORDENADAS. El modelo acaba de
// colocar el agua, el arco y la hoguera, y sabe cómo se llaman; repetir sus
// números a mano es justo lo que hace mal —los redondea, los inventa, o copia
// los del ejemplo—. Nombrar el objeto sí lo hace bien. Así que él dice «la
// niebla va sobre el AGUA» y las coordenadas exactas las saca de aquí la
// aplicación, de la caja que ese objeto ya tiene. Si luego se mueve el agua,
// el efecto se puede volver a anclar y sigue encima.

/** Una forma del mapa a la que un efecto se puede colgar. */
export interface Ancla {
  id: string;
  caja: { x: number; y: number; w: number; h: number };
  /** Profundidad de la capa donde vive, para que la cámara lo mueva igual. */
  depth: number;
}

/**
 * Coloca sobre su ancla los efectos que la nombran.
 *
 * Cada forma se coloca donde tiene sentido para ESE efecto, que no es siempre
 * el centro de la caja:
 *   · punto  → el centro, salvo el fuego y el humo, que salen del suelo del
 *              objeto: una hoguera que arde en mitad de un tronco flotando se
 *              ve mal, y es el error más fácil de cometer.
 *   · linea  → el borde de arriba, de lado a lado. Es lo que hace que la niebla
 *              corra a lo largo del agua en vez de salir de un punto.
 *   · arriba → no se toca: cubre el cuadro entero por definición.
 *
 * Un ancla que no existe NO tira el efecto: se queda donde estaba y se avisa.
 * Perder el efecto entero por un id mal escrito sería peor que dejarlo mal
 * colocado, que al menos se ve y se arrastra.
 */
export function anclarEfectos(
  efectos: EfectoEscena[],
  anclas: Ancla[],
): { efectos: EfectoEscena[]; avisos: string[] } {
  const avisos: string[] = [];
  const porId = new Map(anclas.map((a) => [a.id, a]));

  const salida = efectos.map((e) => {
    if (!e.ancla) return e;
    const a = porId.get(e.ancla);
    if (!a) {
      // NO se queda «donde estaba»: cuando el modelo manda un ancla, las
      // coordenadas que trae al lado son de relleno y suelen ser basura —en las
      // pruebas, dos lámparas ancladas a «faroles-izquierdos» y
      // «faroles-derechos», que no existían, aparecieron las dos apiladas en
      // (0.05, 0.05), o sea en la esquina de arriba a la izquierda—.
      //
      // Sin sitio bueno, el centro: se ve, se entiende que hay que moverlo y no
      // parece un fallo de dibujo. Y se dice, para que se pueda arreglar.
      // A una franja de arriba el ancla no le hacía falta —cubre el cuadro
      // entero—, así que se dice, pero sin alarmar: no hay nada que recolocar.
      if (e.shape === "arriba") {
        avisos.push(
          `«${e.ancla}» no es ninguna forma del mapa; «${nombreEfecto(e.kind)}» cae sobre toda la escena igualmente.`,
        );
        return e;
      }
      avisos.push(
        `«${e.ancla}» no es ninguna forma del mapa: «${nombreEfecto(e.kind)}» se ha puesto en el centro.`,
      );
      return { ...e, x: 0.5, y: 0.55, x2: 0.5, y2: 0.55 };
    }
    const { x, y, w, h } = a.caja;
    // La franja de arriba no se mueve al ancla: cubre el cuadro entero por
    // definición. Del ancla solo se toma a qué distancia está.
    if (e.shape === "arriba") return { ...e, ...franjaDeArriba(), depth: a.depth };
    if (e.shape === "linea" || e.shape === "libre") {
      return { ...e, x, y, x2: x + w, y2: y, depth: a.depth };
    }
    const alSuelo = e.kind === "fuego" || e.kind === "humo" || e.kind === "burbujas";
    return {
      ...e,
      x: x + w / 2,
      y: alSuelo ? y + h * 0.92 : y + h / 2,
      x2: x + w / 2,
      y2: alSuelo ? y + h * 0.92 : y + h / 2,
      depth: a.depth,
    };
  });
  return { efectos: separarApilados(salida), avisos };
}

/**
 * Aparta los que hayan caído exactamente en el mismo sitio.
 *
 * Pasa cuando varias anclas fallan: todas van al mismo sitio de reserva y se
 * apilan, así que se ve UN efecto donde el modelo quería tres y parece que dos
 * no se han puesto. Se reparten en horizontal alrededor de donde estaban: sigue
 * habiendo que colocarlos a mano, pero se ven los tres y se pueden coger.
 */
export function separarApilados(efectos: EfectoEscena[]): EfectoEscena[] {
  const grupos = new Map<string, EfectoEscena[]>();
  for (const e of efectos) {
    if (e.shape === "arriba") continue;
    const clave = `${e.kind}@${e.x.toFixed(3)},${e.y.toFixed(3)}`;
    const g = grupos.get(clave);
    if (g) g.push(e); else grupos.set(clave, [e]);
  }
  const movidos = new Map<string, { x: number; y: number }>();
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    const paso = 0.16;
    const inicio = -((g.length - 1) / 2) * paso;
    g.forEach((e, i) => {
      movidos.set(e.id, {
        x: Math.max(0.04, Math.min(0.96, e.x + inicio + i * paso)),
        y: e.y,
      });
    });
  }
  if (!movidos.size) return efectos;
  return efectos.map((e) => {
    const m = movidos.get(e.id);
    return m ? { ...e, x: m.x, y: m.y, x2: m.x, y2: m.y } : e;
  });
}

/** Saca de la escena todas las formas a las que se puede anclar un efecto. */
export function anclasDeEscena(escena: {
  layers?: { depth?: number; objects?: { id?: string }[] }[];
}): Ancla[] {
  const out: Ancla[] = [];
  for (const capa of escena.layers ?? []) {
    for (const o of capa.objects ?? []) {
      if (!o || typeof o.id !== "string" || !o.id) continue;
      out.push({
        id: o.id,
        caja: cajaDeObjeto(o as Parameters<typeof cajaDeObjeto>[0]),
        depth: num(capa.depth, 0.35),
      });
    }
  }
  return out;
}
