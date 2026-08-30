import type { MedioEscena, PaletaIa } from "./paleta";

// Cuántas escenas de cada medio lleva ESTE capítulo.
//
// POR QUÉ EXISTE. La instrucción decía «dos o tres como mucho», y salían dos.
// Siempre dos. Un modelo con un rango difuso se planta en el número más bajo
// que no le den por incumplido y no se mueve de ahí en cien generaciones, así
// que la variedad que se pedía con palabras no llegaba nunca.
//
// LO QUE SE HACE EN VEZ DE PEDIRLA. Se decide aquí, con un dado, ANTES de
// escribir nada: «este capítulo lleva exactamente 2 fotos vivas y 1 paralaje,
// el resto plano». Al modelo se le da el número exacto y se le deja elegir en
// qué escenas —que es la parte que él sabe hacer mejor que nadie— y luego se
// comprueba. Un número exacto sí se cumple; un rango, no.
//
// LO QUE NO HACE. Decidir qué escena es cuál. Eso es del modelo: sabe dónde el
// agua se mueve y dónde hay profundidad que aprovechar, y quitárselo sería
// cambiar una monotonía por otra.

export interface RepartoMedios {
  still: number;
  apng: number;
  paralaje: number;
}

/**
 * Dado un número, un generador repetible.
 *
 * mulberry32: treinta y dos bits, cuatro líneas y reparte bien. Hace falta que
 * sea SEMBRABLE, no que sea bueno: sin semilla las pruebas no podrían
 * comprobar nada, y con Math.random dentro esto sería imposible de mirar.
 */
export function aleatorio(semilla: number): () => number {
  let a = (semilla >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una semilla para esta tanda. Fuera de las pruebas, del reloj y del azar. */
export function semillaDeTanda(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/**
 * El paralaje se topa aparte y a propósito.
 *
 * Una escena en 2.5D son cuatro o cinco imágenes; una foto viva, seis; una
 * foto plana, una. Dejar que el dado ponga cinco escenas de paralaje en un
 * capítulo de seis es una factura de treinta imágenes por una historia, y el
 * usuario no se entera hasta que la ve.
 */
export const TOPE_PARALAJE = 3;

/**
 * Cuántas escenas de cada cosa.
 *
 * Las proporciones se sortean dentro de unos márgenes anchos: entre un tercio
 * y tres cuartos de las escenas llevan movimiento, y de esas, entre una cuarta
 * parte y dos tercios son paralaje. Dos capítulos seguidos con la misma idea
 * salen distintos, que es justo lo que faltaba.
 *
 * Se deja SIEMPRE al menos una escena plana cuando hay tres o más: sin una
 * quieta con la que comparar, que todo se mueva no se lee como riqueza sino
 * como ruido.
 */
export function repartoDeMedios(
  escenas: number,
  paleta: PaletaIa,
  semilla: number,
  topeParalaje = TOPE_PARALAJE,
): RepartoMedios {
  const n = Math.max(1, Math.round(escenas));
  if (!paleta.apng && !paleta.paralaje) return { still: n, apng: 0, paralaje: 0 };

  const dado = aleatorio(semilla);
  const fraccion = 0.35 + dado() * 0.4; // 0.35 .. 0.75
  const techo = n >= 3 ? n - 1 : n;
  let vivas = Math.max(1, Math.min(techo, Math.round(n * fraccion)));

  let paralaje = 0;
  let apng = 0;
  if (paleta.paralaje && paleta.apng) {
    const parte = 0.25 + dado() * 0.4; // 0.25 .. 0.65
    paralaje = Math.min(topeParalaje, Math.max(1, Math.round(vivas * parte)));
    // Con una sola escena viva no caben las dos cosas: se echa a suertes cuál.
    if (vivas === 1) paralaje = dado() < 0.5 ? 1 : 0;
    apng = vivas - paralaje;
  } else if (paleta.paralaje) {
    paralaje = Math.min(topeParalaje, vivas);
  } else {
    apng = vivas;
  }

  vivas = apng + paralaje;
  return { still: Math.max(0, n - vivas), apng, paralaje };
}

/**
 * El reparto que pide el usuario a mano, acotado a lo que se puede.
 *
 * El automático es lo bueno para no repetirse, pero a veces se sabe lo que se
 * quiere: «esta la quiero entera en 2.5D» o «esta vez ninguna viva, que voy a
 * probar el guion». Sin esta puerta la única forma de conseguirlo era generar
 * una y otra vez hasta que el dado saliera bien.
 */
export function repartoPedido(
  escenas: number,
  paleta: PaletaIa,
  pedido: { apng?: number; paralaje?: number },
  topeParalaje = TOPE_PARALAJE,
): RepartoMedios {
  const n = Math.max(1, Math.round(escenas));
  const entero = (v: unknown) => {
    const x = Math.round(Number(v));
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  let apng = paleta.apng ? entero(pedido.apng) : 0;
  let paralaje = paleta.paralaje ? Math.min(topeParalaje, entero(pedido.paralaje)) : 0;
  // Si entre las dos piden más escenas de las que hay, se recorta primero el
  // paralaje: es lo más caro con diferencia y lo que peor sienta de más.
  if (apng + paralaje > n) paralaje = Math.max(0, n - apng);
  if (apng > n) apng = n;
  return { still: Math.max(0, n - apng - paralaje), apng, paralaje };
}

/** Lo que se le manda al modelo: números exactos, no «dos o tres». */
export function instruccionesReparto(rep: RepartoMedios): string {
  const total = rep.still + rep.apng + rep.paralaje;
  if (!rep.apng && !rep.paralaje) {
    return "MEDIOS DE ESTE CAPÍTULO: las " + total + " escenas van con \"medio\":\"still\".";
  }
  const partes: string[] = [];
  if (rep.apng) partes.push(`EXACTAMENTE ${rep.apng} con "medio":"apng"`);
  if (rep.paralaje) partes.push(`EXACTAMENTE ${rep.paralaje} con "medio":"paralaje"`);
  partes.push(`las otras ${rep.still} con "medio":"still"`);
  return [
    `MEDIOS DE ESTE CAPÍTULO (recuento cerrado, no es un rango): de las ${total} escenas, ${partes.join(", ")}.`,
    "Ni una más ni una menos. Si te sale otro número, reescribe el reparto antes de contestar.",
    "CUÁLES lo eliges tú, y ahí sí quiero criterio: apng donde el movimiento ya está en la foto (agua, fuego, viento, lluvia sobre un charco, una tela, alguien respirando); paralaje donde hay profundidad que recorrer (un pasillo, un bosque en capas, una ciudad con fondo lejano, algo en primer plano por lo que atravesar).",
    "No las pongas seguidas ni todas al principio: reparte el movimiento por el capítulo.",
  ].join("\n");
}

type EscenaConMedio = { medio?: string; prompt?: string };

/**
 * Cuadrar lo que el modelo marcó con lo que se pidió.
 *
 * Se pide un número exacto y aun así puede llegar otro; entonces se corrige
 * aquí, que es lo que convierte la petición en una garantía. Al ASCENDER se
 * eligen las escenas cuya descripción habla de movimiento o de profundidad
 * —agua, fuego, niebla, un pasillo—; si no hay pistas, se reparten a lo largo
 * del capítulo para que no salgan todas juntas. Al DEGRADAR se quitan las
 * últimas, que suelen ser las de relleno.
 */
export function aplicarReparto(
  scenes: EscenaConMedio[],
  rep: RepartoMedios,
  paleta: PaletaIa,
): { ascendidas: number; degradadas: number } {
  let ascendidas = 0;
  let degradadas = 0;

  const permitido = (m: MedioEscena) =>
    m === "still" || (m === "apng" ? paleta.apng : paleta.paralaje);

  for (const medio of ["apng", "paralaje"] as const) {
    const quiere = permitido(medio) ? (medio === "apng" ? rep.apng : rep.paralaje) : 0;
    const tiene = scenes.filter((s) => s.medio === medio);
    if (tiene.length > quiere) {
      for (const s of tiene.slice(quiere)) { s.medio = "still"; degradadas++; }
    } else if (tiene.length < quiere) {
      const faltan = quiere - tiene.length;
      for (const s of candidatas(scenes, medio, faltan)) { s.medio = medio; ascendidas++; }
    }
  }
  return { ascendidas, degradadas };
}

// Qué palabras de una descripción delatan que ahí hay algo que se mueve, o
// hondura que recorrer. No es adivinación fina: es mejor que coger las tres
// primeras escenas, que es lo que haría un reparto ciego.
const PISTAS: Record<"apng" | "paralaje", RegExp> = {
  apng: /\b(agua|mar|olas?|r[ií]o|lluvia|llueve|fuego|llamas?|hoguera|antorcha|humo|viento|nieve|nieva|polvo|ceniza|hojas|vela|niebla|bruma|respir|cabello|pelo|tela|bandera|cortina|vapor|burbuj|chispas?|estrellas?|water|rain|fire|smoke|wind|snow|waves?)\b/i,
  paralaje: /\b(pasillo|bosque|calle|avenida|ciudad|puente|columnas?|arcos?|escaleras?|monta[ñn]a|valle|horizonte|profundidad|al fondo|de fondo|primer plano|t[uú]nel|puerta|umbral|ventana|cueva|corredor|forest|street|corridor|tunnel|bridge)\b/i,
};

function candidatas(scenes: EscenaConMedio[], medio: "apng" | "paralaje", cuantas: number) {
  const libres = scenes.filter((s) => !s.medio || s.medio === "still");
  const conPista = libres.filter((s) => PISTAS[medio].test(s.prompt ?? ""));
  if (conPista.length >= cuantas) return conPista.slice(0, cuantas);
  // Lo que falte, repartido a zancadas por el capítulo en vez de las primeras
  // seguidas: dos escenas vivas pegadas se leen como una sola larga.
  const resto = libres.filter((s) => !conPista.includes(s));
  const faltan = cuantas - conPista.length;
  const paso = Math.max(1, Math.floor(resto.length / Math.max(1, faltan)));
  const sueltas: EscenaConMedio[] = [];
  for (let i = 0; i < resto.length && sueltas.length < faltan; i += paso) sueltas.push(resto[i]);
  return [...conPista, ...sueltas];
}
