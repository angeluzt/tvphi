import "server-only";
import type { StoryProject } from "@/lib/story/model";

// Que los personajes no cambien de cara entre escena y escena.
//
// EL PROBLEMA, tal cual es: cada imagen se pide a OpenAI en una llamada
// SEPARADA, y el modelo no recuerda nada de la anterior. Lo único que puede
// mantener a alguien igual entre la escena 1 y la 5 es que su descripción vaya
// ESCRITA en las dos, palabra por palabra.
//
// Al modelo que escribe el guion se le pedía eso en una línea de las
// instrucciones. Y lo cumple… un par de escenas. Para la cuarta ya pone «Elena
// mira por la ventana», sin decir quién es Elena, y ahí el modelo de imagen se
// inventa otra persona: otra edad, otro pelo, a veces una niña.
//
// LA SOLUCIÓN es no pedirlo: hacerlo. El guion trae un REPARTO —una ficha por
// personaje— y un ESTILO, y aquí se pegan por código al prompt de cada escena
// donde ese personaje sale. Así no depende de que el modelo se acuerde, que es
// justo lo que no hace.
//
// Se nota más en calidad baja, porque con menos pasos de refinado el modelo se
// queda con la idea general y improvisa los detalles. Repetir la ficha es lo
// que le quita margen para improvisar.

/** Una ficha por nombre: «Elena» → «mujer de unos 30, pelo negro corto…». */
export type Reparto = Record<string, string>;

export interface Consistencia {
  /** Escenas a las que se les pegó al menos una ficha. */
  escenas: number;
  /** Nombres que se usaron. */
  personajes: string[];
  /** Si el guion traía estilo común. */
  conEstilo: boolean;
}

const LIMITE_FICHA = 400;
const LIMITE_ESTILO = 400;

/** Saca el reparto del JSON del modelo, tolerando que venga de varias formas. */
export function leerReparto(crudo: any): Reparto {
  const fuente = crudo?.project?.reparto ?? crudo?.reparto ?? crudo?.project?.cast ?? null;
  const out: Reparto = {};
  if (!fuente) return out;

  // Como objeto {nombre: descripción}.
  if (!Array.isArray(fuente) && typeof fuente === "object") {
    for (const [k, v] of Object.entries(fuente)) {
      const nombre = String(k).trim();
      const desc = String(v ?? "").trim();
      if (nombre && desc) out[nombre] = desc.slice(0, LIMITE_FICHA);
    }
    return out;
  }
  // Como lista [{nombre, descripcion}].
  if (Array.isArray(fuente)) {
    for (const p of fuente) {
      const nombre = String(p?.nombre ?? p?.name ?? "").trim();
      const desc = String(p?.descripcion ?? p?.description ?? p?.desc ?? "").trim();
      if (nombre && desc) out[nombre] = desc.slice(0, LIMITE_FICHA);
    }
  }
  return out;
}

export function leerEstilo(crudo: any): string {
  const v = crudo?.project?.estilo ?? crudo?.estilo ?? crudo?.project?.style ?? "";
  return String(v ?? "").trim().slice(0, LIMITE_ESTILO);
}

/**
 * Quién sale en esta escena.
 *
 * Se mira por tres sitios, de más fiable a menos, porque el modelo rellena unos
 * u otros según le da:
 *   1. `personajes` de la escena, si lo puso.
 *   2. Quién habla en sus tomas — ese dato ya existía y es de fiar.
 *   3. El nombre escrito en el propio prompt de la escena.
 *
 * Lo tercero va con frontera de palabra: sin eso, un personaje llamado «Ana»
 * aparecería en toda escena que mencionara una «ventana».
 */
function quienSale(sc: any, reparto: Reparto): string[] {
  const fuera = new Set<string>();

  const marcados = Array.isArray(sc?.personajes) ? sc.personajes : [];
  for (const n of marcados) {
    const nombre = String(n ?? "").trim();
    if (reparto[nombre]) fuera.add(nombre);
  }

  for (const shot of sc?.shots ?? []) {
    for (const d of shot?.dialogues ?? []) {
      const quien = String(d?.quien ?? "").trim();
      if (quien && reparto[quien]) fuera.add(quien);
    }
  }

  const prompt = String(sc?.prompt ?? "");
  for (const nombre of Object.keys(reparto)) {
    if (fuera.has(nombre)) continue;
    const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapado}([^\\p{L}\\p{N}]|$)`, "iu").test(prompt)) {
      fuera.add(nombre);
    }
  }

  return [...fuera];
}

/**
 * Pega las fichas y el estilo al prompt de cada escena.
 *
 * Modifica el proyecto en su sitio y devuelve qué se hizo, para poder decírselo
 * al usuario en vez de cambiarle el guion a escondidas.
 */
export function fijarConsistencia(
  project: StoryProject,
  reparto: Reparto,
  estilo: string,
): Consistencia {
  const usados = new Set<string>();
  let escenas = 0;

  for (const sc of project.scenes as any[]) {
    const base = String(sc.prompt ?? "").trim();
    if (!base) continue;

    const quienes = quienSale(sc, reparto);
    const fichas = quienes.map((n) => `${n}: ${reparto[n]}`);

    const trozos = [base];
    if (fichas.length) {
      // En inglés y con «exactly» porque es lo que lee el modelo de imagen, y
      // porque decirlo flojo («intenta que se parezcan») no sirve de nada.
      trozos.push(
        "SAME CHARACTERS AS THE OTHER SCENES — draw them exactly as described, "
        + "do not reinterpret age, skin tone, hair or clothing: "
        + fichas.join(" | "),
      );
      quienes.forEach((n) => usados.add(n));
    }
    if (estilo) trozos.push(`CONSISTENT VISUAL STYLE ACROSS ALL SCENES: ${estilo}`);

    if (trozos.length > 1) escenas++;
    sc.prompt = trozos.join("\n");
  }

  return { escenas, personajes: [...usados], conEstilo: !!estilo };
}
