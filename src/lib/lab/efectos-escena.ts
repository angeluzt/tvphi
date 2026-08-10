import {
  VFX, vfxDefaults, type VfxInput, type VfxKind, type VfxShape,
} from "@/lib/story/vfx";

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
function formaDe(kind: VfxKind, pedida: unknown): VfxShape {
  const spec = VFX.find((v) => v.id === kind);
  if (!spec) return "punto";
  const f = String(pedida ?? "").trim() as VfxShape;
  // Un efecto pedido con una forma que no admite no se descarta: se le pone la
  // suya. Descartarlo dejaría la escena sin el efecto por un detalle que el
  // modelo no tenía por qué acertar.
  return spec.shapes.includes(f) ? f : spec.shapes[0];
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
    const x = acotar(num(nodo?.x ?? o.x, 0.5), -0.5, 1.5);
    const y = acotar(num(nodo?.y ?? o.y, 0.5), -0.5, 1.5);
    const x2 = acotar(num(nodo?.x2 ?? o.x2, x), -0.5, 1.5);
    const y2 = acotar(num(nodo?.y2 ?? o.y2, y), -0.5, 1.5);

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

    efectos.push({
      id: typeof o.instanciaId === "string" && o.instanciaId ? o.instanciaId : `fx${i + 1}-${kind}`,
      kind, shape, espacio, x, y, x2, y2,
      depth: acotar(num(o.depth, 0.35), 0, 1),
      colorHex: colorDe(kind, o.colorHex ?? o.color),
      params,
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
