import type { MedioEscena } from "./paleta";
import { FPS_LOOP_DEFECTO, MAX_FOTOS_LOOP, MIN_FOTOS_LOOP } from "./medio";
import type {
  AccionSprite, AnclajeSprite, DireccionSprite, VistaSprite,
} from "@/lib/lab/biblioteca";

// Lo que la IA dice de CÓMO se monta cada escena, no solo de qué medio es.
//
// EL AGUJERO QUE TAPA. Hasta ahora la IA escribía "medio":"apng" y ahí se
// acababa su participación: los seis fotogramas, el fps, qué era exactamente lo
// que se movía y cuántas láminas llevaba un paralaje los ponía el código, todos
// iguales para todas las escenas. O sea que el modelo elegía la etiqueta y la
// etiqueta no decía nada. Por eso una foto viva de un mar en tormenta y otra de
// una vela encendida salían con los mismos seis cuadros a seis fps: el sistema
// no sabía que una cosa es un oleaje y la otra un parpadeo.
//
// AHORA. La IA escribe el plan entero de la escena y el código lo ejecuta.
// Qué se mueve, con qué técnica, cuántos cuadros, cuántas láminas y cuáles de
// esas láminas respiran. Es la diferencia entre «marca esta escena» y «monta
// esta escena».
//
// TODO ES OPCIONAL. Sin plan, cada medio se materializa con lo de siempre. Un
// capítulo de antes no sabe que esto existe y se sigue montando igual.

export type TecnicaViva = "cuadros" | "sprites";

/**
 * Un actor recortado que se mueve encima de la foto quieta.
 *
 * Es lo que hace barata la foto viva: en vez de repintar la escena entera seis
 * veces, se dibuja UNA hoja con los seis cuadros del bicho y se pega encima.
 */
export interface ElementoVivo {
  /** Qué es, en inglés y sin fondo: «a seagull gliding, side view». */
  que: string;
  /** Dónde va, 0..1 sobre la foto. Con anclaje «pies», es donde apoya. */
  x: number;
  y: number;
  /** Qué parte del alto ocupa. 0.15 = una séptima parte del cuadro. */
  alto: number;
  fotogramas: number;
  fps: number;
  vista: VistaSprite;
  direccion: DireccionSprite;
  accion: AccionSprite;
  anclaje: AnclajeSprite;
  /** Se voltea para mirar al otro lado. */
  espejo?: boolean;
  /** A dónde va, si va a alguna parte. Sin esto se queda animándose en su sitio. */
  hasta?: { x: number; y: number; segundos: number; bucle?: boolean };
}

export interface PlanViva {
  tecnica: TecnicaViva;
  /** Qué se mueve, con palabras: «the water of the shore», «the candle flame». */
  movimiento?: string;
  /** Cuántos cuadros. Un oleaje pide más que un parpadeo. */
  fotogramas: number;
  fps: number;
  /** Solo con técnica «sprites». */
  elementos: ElementoVivo[];
}

export interface PlanParalaje {
  /** Cuántas láminas dibujadas. Cada una es una imagen que se paga. */
  capas: number;
  /**
   * Qué láminas respiran, por lo que se ve en ellas: «agua», «cielo», «fuego».
   * Se casan luego con los nombres reales que ponga el mapa de la escena.
   */
  vivas: string[];
  /** Actores animados sobre las láminas. Los escribe el mapa, aquí solo se pide. */
  sprites: boolean;
}

export interface PlanMedio {
  viva?: PlanViva;
  paralaje?: PlanParalaje;
}

const num = (v: unknown, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
};
const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const texto = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

function unaDe<T extends string>(v: unknown, opciones: readonly T[], def: T): T {
  return typeof v === "string" && (opciones as readonly string[]).includes(v) ? (v as T) : def;
}

const VISTAS = ["lateral", "frontal", "trasera", "superior", "libre"] as const;
const DIRECCIONES = ["derecha", "izquierda", "frente", "espaldas", "arriba", "abajo", "ninguna"] as const;
const ACCIONES = ["quieto", "caminar", "correr", "volar", "flotar", "nadar", "caer", "girar", "otro"] as const;
const ANCLAJES = ["centro", "pies"] as const;

/** Cuántos actores caben en una foto viva sin que se vuelva un zoo. */
export const MAX_ELEMENTOS_VIVOS = 4;
/** Cuántas láminas dibujadas admite un paralaje. */
export const MIN_CAPAS_PARALAJE = 3;
export const MAX_CAPAS_PARALAJE = 6;
/**
 * Y cuántas de esas láminas se pueden animar.
 *
 * Dos. Cada una son cinco imágenes, así que una escena con tres láminas vivas
 * cuesta más que un capítulo entero de fotos planas. El tope está aquí y no en
 * quien monta para que la cuenta que se le enseña al usuario ANTES de gastar
 * sea la misma que se va a gastar de verdad.
 */
export const MAX_LAMINAS_VIVAS = 2;

function normalizarElemento(raw: unknown): ElementoVivo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const que = texto(r.que, 400);
  if (que.length < 3) return null;
  const hastaRaw = r.hasta && typeof r.hasta === "object" ? r.hasta as Record<string, unknown> : null;
  return {
    que,
    // Se deja salirse un poco del cuadro: un pájaro tiene que poder entrar
    // desde fuera, y acotado a 0..1 aparecería de golpe pegado al borde.
    x: acotar(num(r.x, 0.5), -0.4, 1.4),
    y: acotar(num(r.y, 0.6), -0.4, 1.4),
    alto: acotar(num(r.alto, 0.18), 0.03, 1),
    fotogramas: Math.round(acotar(num(r.fotogramas, 6), 2, 12)),
    fps: Math.round(acotar(num(r.fps, 8), 1, 24)),
    vista: unaDe(r.vista, VISTAS, "lateral"),
    direccion: unaDe(r.direccion, DIRECCIONES, "derecha"),
    accion: unaDe(r.accion, ACCIONES, "otro"),
    anclaje: unaDe(r.anclaje, ANCLAJES, "centro"),
    ...(r.espejo === true ? { espejo: true } : {}),
    ...(hastaRaw ? {
      hasta: {
        x: acotar(num(hastaRaw.x, 0.5), -0.4, 1.4),
        y: acotar(num(hastaRaw.y, 0.6), -0.4, 1.4),
        segundos: acotar(num(hastaRaw.segundos, 5), 0.5, 60),
        ...(hastaRaw.bucle === true ? { bucle: true } : {}),
      },
    } : {}),
  };
}

/**
 * Lee el plan que escribió la IA para una escena, con la paleta delante.
 *
 * Lo que la paleta no deja no se cuela por aquí: si los sprites están apagados,
 * una técnica «sprites» vuelve a cuadros, porque materializarla llamaría a una
 * ruta que el usuario no ha encendido y se gastaría en algo que no pidió.
 */
export function normalizarPlanMedio(
  raw: unknown,
  medio: MedioEscena,
  opciones: { sprites: boolean } = { sprites: false },
): PlanMedio | undefined {
  const r = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};

  if (medio === "apng") {
    const v = r.viva && typeof r.viva === "object" ? r.viva as Record<string, unknown> : {};
    const pedida = unaDe(v.tecnica, ["cuadros", "sprites"] as const, "cuadros");
    const tecnica: TecnicaViva = pedida === "sprites" && opciones.sprites ? "sprites" : "cuadros";
    const elementos = tecnica === "sprites" && Array.isArray(v.elementos)
      ? v.elementos.map(normalizarElemento)
        .filter((e): e is ElementoVivo => !!e)
        .slice(0, MAX_ELEMENTOS_VIVOS)
      : [];
    // Una foto viva de sprites SIN sprites no es una foto viva: es la foto. Se
    // cae a cuadros en vez de dejar una escena marcada como viva y quieta.
    if (tecnica === "sprites" && !elementos.length) {
      return {
        viva: {
          tecnica: "cuadros",
          movimiento: texto(v.movimiento, 400) || undefined,
          fotogramas: Math.round(acotar(num(v.fotogramas, 6), MIN_FOTOS_LOOP, MAX_FOTOS_LOOP)),
          fps: Math.round(acotar(num(v.fps, FPS_LOOP_DEFECTO), 1, 16)),
          elementos: [],
        },
      };
    }
    return {
      viva: {
        tecnica,
        movimiento: texto(v.movimiento, 400) || undefined,
        fotogramas: Math.round(acotar(num(v.fotogramas, 6), MIN_FOTOS_LOOP, MAX_FOTOS_LOOP)),
        fps: Math.round(acotar(num(v.fps, FPS_LOOP_DEFECTO), 1, 16)),
        elementos,
      },
    };
  }

  if (medio === "paralaje") {
    const p = r.paralaje && typeof r.paralaje === "object" ? r.paralaje as Record<string, unknown> : {};
    const vivas = Array.isArray(p.vivas)
      ? p.vivas.map((x) => texto(x, 60)).filter(Boolean).slice(0, MAX_CAPAS_PARALAJE)
      : [];
    return {
      paralaje: {
        capas: Math.round(acotar(num(p.capas, 4), MIN_CAPAS_PARALAJE, MAX_CAPAS_PARALAJE)),
        vivas,
        sprites: opciones.sprites && p.sprites === true,
      },
    };
  }

  return undefined;
}

/**
 * Cuántas imágenes cuesta montar esta escena. Se enseña ANTES de gastar.
 *
 * El still ya cuenta uno: es la foto de la escena, que se paga igual sea cual
 * sea el medio. Lo demás se suma encima.
 */
export function imagenesDelPlan(medio: MedioEscena, plan: PlanMedio | undefined): number {
  if (medio === "apng") {
    const v = plan?.viva;
    if (!v) return 1 + 5;
    // Con sprites: la foto + UNA hoja por actor. Con cuadros: la foto + N-1
    // repintados enteros. Ahí está la diferencia de precio, y es enorme.
    return v.tecnica === "sprites"
      ? 1 + v.elementos.length
      : 1 + Math.max(0, v.fotogramas - 1);
  }
  if (medio === "paralaje") {
    const p = plan?.paralaje;
    const capas = p?.capas ?? 4;
    const vivas = Math.min(p?.vivas.length ?? 0, capas, MAX_LAMINAS_VIVAS);
    // Cada lámina viva son 5 repintados suyos, aparte de la lámina misma.
    return 1 + capas + vivas * 5;
  }
  return 1;
}

/** Lo mismo para el capítulo entero. */
export function imagenesDelCapitulo(
  scenes: { medio?: MedioEscena | string; plan?: PlanMedio }[],
): number {
  return scenes.reduce((t, sc) => {
    const m: MedioEscena = sc.medio === "apng" || sc.medio === "paralaje" ? sc.medio : "still";
    return t + imagenesDelPlan(m, sc.plan);
  }, 0);
}

/** Una línea para la interfaz: qué es esta escena y qué va a costar. */
export function resumenPlan(medio: MedioEscena, plan: PlanMedio | undefined): string {
  const imgs = imagenesDelPlan(medio, plan);
  const coste = `${imgs} ${imgs === 1 ? "imagen" : "imágenes"}`;
  if (medio === "apng") {
    const v = plan?.viva;
    if (v?.tecnica === "sprites") {
      return `Foto viva con ${v.elementos.length} ${v.elementos.length === 1 ? "actor" : "actores"} · ${coste}`;
    }
    return `Foto viva de ${v?.fotogramas ?? 6} cuadros · ${coste}`;
  }
  if (medio === "paralaje") {
    const p = plan?.paralaje;
    const vivas = p?.vivas.length ?? 0;
    return `2.5D de ${p?.capas ?? 4} láminas${vivas ? `, ${vivas} viva${vivas === 1 ? "" : "s"}` : ""} · ${coste}`;
  }
  return `Foto plana · ${coste}`;
}

/**
 * Que ninguna escena se quede sin plan —o con uno que ya no le toca—.
 *
 * Hace falta porque el medio de una escena puede CAMBIAR después de que el
 * modelo escribiera su plan: el reparto de medios asciende y degrada escenas
 * para que salgan los números pedidos, y una escena recién ascendida a foto
 * viva no trae plan ninguno mientras que una degradada a plana se queda con el
 * suyo colgando. Sin esto, la primera no se montaría y la segunda se montaría
 * de más.
 */
export function asegurarPlanes(
  scenes: { medio?: MedioEscena | string; plan?: PlanMedio }[],
  opciones: { sprites: boolean },
): { puestos: number; quitados: number } {
  let puestos = 0;
  let quitados = 0;
  for (const sc of scenes) {
    const medio: MedioEscena = sc.medio === "apng" || sc.medio === "paralaje" ? sc.medio : "still";
    if (medio === "still") {
      if (sc.plan) { delete sc.plan; quitados++; }
      continue;
    }
    // Un plan de otro medio no vale: el de una foto viva no dice nada de
    // láminas, y al revés. Se rehace desde cero con lo que sí encaje.
    const encaja = medio === "apng" ? !!sc.plan?.viva : !!sc.plan?.paralaje;
    if (encaja) continue;
    sc.plan = normalizarPlanMedio(undefined, medio, opciones);
    puestos++;
  }
  return { puestos, quitados };
}

/**
 * Cómo se le explica el plan al modelo.
 *
 * Va aparte de la paleta a propósito: la paleta dice QUÉ puede usar, esto dice
 * CÓMO se escribe. Mezclarlos en un solo bloque hacía que al apagar una cosa se
 * fuera también la explicación de otra.
 */
export function instruccionesPlan(opciones: {
  apng: boolean;
  paralaje: boolean;
  sprites: boolean;
}): string {
  if (!opciones.apng && !opciones.paralaje) {
    return "Todas las escenas van con \"medio\":\"still\" y sin \"plan\": una foto por escena.";
  }
  const lineas: string[] = [
    "PLAN DE CADA ESCENA (esto no dibuja nada: dice cómo se va a montar después).",
    "Junto a \"medio\", cada escena que NO sea still lleva un objeto \"plan\".",
  ];

  if (opciones.apng) {
    lineas.push(
      "",
      "FOTO VIVA — \"medio\":\"apng\". Hay DOS técnicas y elegir bien es la mitad del resultado:",
      "",
      "· \"cuadros\": la foto entera se vuelve a pintar N veces con un cambio mínimo cada vez. Es para cuando lo que se mueve es TODA la imagen o algo sin forma fija: agua, fuego, humo, niebla, lluvia sobre un charco, una tela al viento, alguien respirando.",
      "  plan: {\"viva\":{\"tecnica\":\"cuadros\",\"movimiento\":\"qué se mueve, EN INGLÉS y concreto\",\"fotogramas\":6,\"fps\":6}}",
      `  fotogramas de ${MIN_FOTOS_LOOP} a ${MAX_FOTOS_LOOP} y fps de 1 a 16, y elígelos según lo que pasa: un oleaje largo pide 8-10 cuadros a 8 fps; el parpadeo de una vela, 3-4 cuadros a 4 fps. NO pongas 6 y 6 en todas.`,
      "  CADA fotograma cuesta una imagen. Diez cuadros son diez imágenes de esa escena: úsalos cuando el movimiento lo merezca.",
    );
    if (opciones.sprites) {
      lineas.push(
        "",
        "· \"sprites\": la foto se queda QUIETA y encima se pegan actores recortados que sí se animan. Es para cuando lo que se mueve es una COSA con forma reconocible: un pájaro, una persona que camina, un barco, un carro, un perro, un pez, una hoja que cae.",
        "  plan: {\"viva\":{\"tecnica\":\"sprites\",\"elementos\":[{\"que\":\"a grey seagull gliding, wings flapping, side view\",\"x\":0.2,\"y\":0.3,\"alto\":0.1,\"fotogramas\":6,\"fps\":10,\"vista\":\"lateral\",\"direccion\":\"derecha\",\"accion\":\"volar\",\"anclaje\":\"centro\",\"hasta\":{\"x\":1.2,\"y\":0.25,\"segundos\":7,\"bucle\":true}}]}}",
        "  Cuesta UNA imagen por actor, no una por fotograma: es con diferencia la forma más barata de que una escena se mueva, y la única que deja la foto original intacta.",
        `  Como mucho ${MAX_ELEMENTOS_VIVOS} actores, y normalmente 1 o 2 se ven mejor que cuatro.`,
        "  \"que\" va EN INGLÉS y describe SOLO al actor: nada de fondo, suelo, sombra ni escenario, que se recorta sobre la foto.",
        "  x/y/alto son proporciones del cuadro. Con \"anclaje\":\"pies\" el punto es donde apoya (personas, animales, vehículos); \"centro\" para lo que vuela o flota.",
        "  \"hasta\" es opcional: sin él el actor se anima en su sitio; con él cruza la escena. Puede empezar o acabar fuera del cuadro (x menor que 0 o mayor que 1).",
        "  \"vista\":\"lateral\" y \"direccion\" derecha/izquierda para lo que cruza; \"frontal\" para lo que viene hacia cámara.",
        "",
        "ELIGE LA TÉCNICA POR LO QUE SE MUEVE, no por costumbre: agua/fuego/humo/viento → cuadros. Bicho/persona/vehículo → sprites. Si en la misma escena hay las dos cosas, gana lo que más se note.",
      );
    } else {
      lineas.push("", "En este capítulo SOLO está permitida la técnica \"cuadros\".");
    }
  }

  if (opciones.paralaje) {
    lineas.push(
      "",
      "PARALAJE 2.5D — \"medio\":\"paralaje\". La escena se parte en láminas a distinta profundidad y la cámara las recorre.",
      `  plan: {\"paralaje\":{\"capas\":4,\"vivas\":[\"agua\",\"antorchas\"]${opciones.sprites ? ",\"sprites\":true" : ""}}}`,
      `  \"capas\": de ${MIN_CAPAS_PARALAJE} a ${MAX_CAPAS_PARALAJE} láminas dibujadas, y cada una cuesta una imagen. Un fondo con dos planos delante son 3; un bosque profundo, 5 o 6.`,
      "  \"vivas\": QUÉ láminas respiran, dichas por lo que se ve en ellas (\"agua\", \"cielo\", \"fuego\", \"vegetación\", \"antorchas\"). Cada lámina viva cuesta 5 imágenes más: pon una o dos, las que de verdad se muevan, y deja [] si ninguna lo pide.",
      "  El fondo y el suelo NO van en \"vivas\": si se mueven se ve el borde.",
    );
    if (opciones.sprites) {
      lineas.push("  \"sprites\":true si la escena pide además actores animados encima (alguien que cruza, un pájaro). Los coloca después el mapa de la escena.");
    }
  }

  lineas.push(
    "",
    "REGLA GENERAL DEL PLAN: no repitas los mismos números escena tras escena. Si dos fotos vivas del capítulo llevan exactamente los mismos fotogramas, el mismo fps y el mismo movimiento, es que no has mirado lo que pasa en cada una.",
  );
  return lineas.join("\n");
}
