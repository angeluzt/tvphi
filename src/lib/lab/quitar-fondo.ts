// Dejar una capa sin fondo, para poder apilarla.
//
// LO NORMAL, hoy, es que venga con CROMA: al modelo se le pide un fondo PLANO
// de un color raro y aquí se le quita. No es tan bueno como la transparencia de
// verdad —los bordes finos sufren— pero es lo que gpt-image-2 sabe hacer, y es
// mucho mejor que tirar la imagen.
//
// SI VIENE CON ALFA de verdad, mejor: se deja tal cual. Pasa con los modelos que
// admiten background: "transparent", y entonces sale perfecta —bordes limpios,
// pelo, humo, todo—. Este archivo no pregunta cuál fue: lo mira.
//
// Se decide MIRANDO la imagen, no confiando en lo que dijo la API: se cuenta
// cuánto hay transparente de verdad.

/**
 * El color de emergencia que se le pide al modelo si no puede dar
 * transparencia. Magenta puro: no aparece casi nunca en un dibujo, así que
 * quitarlo no se lleva nada por delante.
 *
 * Vive aquí y no en la ruta porque una ruta de Next solo puede exportar sus
 * verbos: cualquier otra cosa rompe la compilación de tipos.
 */
export const CROMA = "#FF00FF";

export interface Recorte {
  /** El PNG ya sin fondo. */
  url: string;
  /** Qué se hizo: sirve para decírselo al usuario sin que tenga que adivinar. */
  via: "transparente" | "croma" | "opaca";
  /** Porcentaje de píxeles transparentes al acabar. */
  vacio: number;
  /** El color que se quitó, si hubo croma. */
  color?: string;
}

const lienzoDe = (img: HTMLImageElement) => {
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  cv.getContext("2d")!.drawImage(img, 0, 0);
  return cv;
};

export const cargarImagen = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("la imagen no se puede leer"));
    i.src = src;
  });

/** Cuánto hay ya transparente, de 0 a 1. */
export function huecoDe(d: Uint8ClampedArray) {
  let vacios = 0, total = 0;
  for (let i = 3; i < d.length; i += 4 * 17) { total++; if (d[i] < 16) vacios++; }
  return total ? vacios / total : 0;
}

/**
 * El color del fondo, si es que hay uno plano.
 *
 * Se mira SOLO el borde: si el modelo puso un fondo de color, ahí está, y lo
 * que hay en el centro es el dibujo. Se exige que el borde sea de un color
 * parecido en casi todo su recorrido; si no lo es, es que no hay fondo plano y
 * no se toca nada. Quitar un color a ojo en una imagen sin croma la destroza.
 */
export function colorDelFondo(d: Uint8ClampedArray, w: number, h: number) {
  const px = (x: number, y: number): [number, number, number] | null => {
    const i = (y * w + x) * 4;
    return d[i + 3] < 128 ? null : [d[i], d[i + 1], d[i + 2]];
  };
  const muestras: [number, number, number][] = [];
  const paso = Math.max(1, Math.floor(Math.min(w, h) / 80));
  for (let x = 0; x < w; x += paso) { const a = px(x, 0), b = px(x, h - 1); if (a) muestras.push(a); if (b) muestras.push(b); }
  for (let y = 0; y < h; y += paso) { const a = px(0, y), b = px(w - 1, y); if (a) muestras.push(a); if (b) muestras.push(b); }
  if (muestras.length < 20) return null;

  // El color más repetido del borde, agrupando por tramos para que los píxeles
  // vecinos cuenten como el mismo. Antes se usaba la mediana, y la mediana se
  // va al garete en cuanto el dibujo ocupa un buen trozo del borde —una roca en
  // la esquina, el suelo abajo—, que es lo normal en una capa de primer plano.
  const cajones = new Map<string, { suma: [number, number, number]; n: number }>();
  for (const m of muestras) {
    const k = `${m[0] >> 4},${m[1] >> 4},${m[2] >> 4}`;
    const c = cajones.get(k) ?? { suma: [0, 0, 0] as [number, number, number], n: 0 };
    c.suma[0] += m[0]; c.suma[1] += m[1]; c.suma[2] += m[2]; c.n++;
    cajones.set(k, c);
  }
  const mejor = [...cajones.values()].sort((a, b) => b.n - a.n)[0];
  if (!mejor) return null;
  const base: [number, number, number] = [
    Math.round(mejor.suma[0] / mejor.n),
    Math.round(mejor.suma[1] / mejor.n),
    Math.round(mejor.suma[2] / mejor.n),
  ];

  // Dos pruebas, y las dos tienen que pasar.
  //
  // 1) Que ese color ocupe un buen trozo del borde.
  const cerca = muestras.filter((m) => dist(m, base) < 42).length;
  if (cerca / muestras.length < 0.35) return null;

  // 2) LAS ESQUINAS, que es lo que de verdad separa un croma de un paisaje. En
  //    una capa sobre color plano, casi todas las esquinas son ese color: el
  //    dibujo rara vez ocupa las cuatro. En una imagen a sangre —un degradado de
  //    cielo a tierra— las esquinas son distintas entre sí, y ahí NO hay nada
  //    que quitar: hacerlo destrozaría la imagen.
  const esquinas = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)];
  const iguales = esquinas.filter((c) => c && dist(c, base) < 42).length;
  if (iguales < 3) return null;

  return base;
}

const dist = (a: [number, number, number], b: [number, number, number]) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const hex = (c: [number, number, number]) =>
  "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

const tope255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * Cuánto croma le sobra a un color.
 *
 * En el croma, unos canales van altos y otro bajo (magenta: rojo y azul arriba,
 * verde abajo). Esto mide lo que los altos le sacan al bajo: en el croma puro
 * vale su máximo, en un gris vale cero, y en un color cálido sale negativo.
 * Aguanta que el croma venga sombreado, cosa que la distancia no aguanta.
 */
function sobra(p: ArrayLike<number>, o: number, altos: number[], bajos: number[]) {
  let a = 255; for (const i of altos) a = Math.min(a, p[o + i]);
  let z = 0; for (const i of bajos) z = Math.max(z, p[o + i]);
  return a - z;
}

/**
 * Quita el croma y le devuelve su color al borde.
 *
 * NO SIRVE preguntar «cuánto se parece esto al magenta». El borde de una hoja
 * sobre magenta es una MEZCLA de hoja y magenta, y a media mezcla ya está
 * lejísimos del magenta puro: en una escena de verdad se midieron píxeles de
 * halo en (192,58,137), a 146 de distancia. Un radio que llegue hasta ahí se
 * come el dibujo, y uno que no llegue deja el borde morado. Por eso quedaba
 * halo: 15.228 píxeles de una escena, casi el 1%.
 *
 * Lo que sí funciona es mirar el TONO —cuánto croma le sobra— y con esa
 * proporción DESMEZCLAR: si lo que se ve es cob·dibujo + (1−cob)·croma,
 * entonces el dibujo es (visto − (1−cob)·croma) / cob. Así el borde no se
 * disimula, se recupera.
 */
export function quitarColor(cv: HTMLCanvasElement, base: [number, number, number]) {
  const c = cv.getContext("2d")!;
  const im = c.getImageData(0, 0, cv.width, cv.height);
  const d = im.data;

  const max = Math.max(...base);
  const altos = [0, 1, 2].filter((i) => base[i] >= max * 0.5);
  const bajos = [0, 1, 2].filter((i) => base[i] < max * 0.5);
  // Un croma sin tono propio —un gris, un blanco— no se puede aislar por tono:
  // ahí se vuelve al método de siempre, por distancia, que es lo único que hay.
  const K = bajos.length ? sobra(base, 0, altos, bajos) : 0;
  if (K < 40) { porDistancia(d, base); c.putImageData(im, 0, 0); return { vacio: huecoDe(d), color: hex(base) }; }

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const t = sobra(d, i, altos, bajos) / K;
    if (t <= 0.05) continue;                 // ni rastro de croma: no se toca
    // Cuánto dibujo hay en este píxel. El 0.05 de suelo evita que un color
    // apenas rozado por el croma se quede medio transparente.
    const cob = Math.min(1, Math.max(0, (1 - t - 0.05) / 0.9));
    if (cob < 0.02) { d[i + 3] = 0; continue; }
    // Desmezclar. Se limita el multiplicador para que un píxel casi vacío no
    // amplifique su propio ruido hasta convertirlo en confeti de colores.
    const inv = 1 / Math.max(cob, 0.25);
    d[i] = tope255((d[i] - (1 - cob) * base[0]) * inv);
    d[i + 1] = tope255((d[i + 1] - (1 - cob) * base[1]) * inv);
    d[i + 2] = tope255((d[i + 2] - (1 - cob) * base[2]) * inv);
    d[i + 3] = Math.round(d[i + 3] * cob);
  }
  c.putImageData(im, 0, 0);
  return { vacio: huecoDe(d), color: hex(base) };
}

/** El método viejo, por distancia. Solo para cromas sin tono que aislar. */
function porDistancia(d: Uint8ClampedArray, base: [number, number, number], dentro = 34, fuera = 120) {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const q = dist([d[i], d[i + 1], d[i + 2]], base);
    if (q <= dentro) { d[i + 3] = 0; continue; }
    if (q < fuera) d[i + 3] = Math.round(d[i + 3] * ((q - dentro) / (fuera - dentro)));
  }
}

/**
 * De lo que devuelva el modelo a una capa apilable.
 *
 * `esFondo` cambia todo: la capa del fondo DEBE quedarse opaca —es la que
 * tapa el negro— así que ahí no se quita nada aunque venga con croma.
 */
export async function prepararCapa(dataUrl: string, esFondo: boolean): Promise<Recorte> {
  const img = await cargarImagen(dataUrl);
  const cv = lienzoDe(img);
  const c = cv.getContext("2d")!;
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  const vacio = huecoDe(d);

  if (esFondo) return { url: cv.toDataURL("image/png"), via: "opaca", vacio };

  // Ya viene con transparencia de verdad: no se toca. Se pide un mínimo del 2%
  // para no confundir cuatro píxeles sueltos con un fondo recortado.
  if (vacio > 0.02) return { url: cv.toDataURL("image/png"), via: "transparente", vacio };

  const base = colorDelFondo(d, cv.width, cv.height);
  if (!base) return { url: cv.toDataURL("image/png"), via: "opaca", vacio };

  const r = quitarColor(cv, base);
  return { url: cv.toDataURL("image/png"), via: "croma", vacio: r.vacio, color: r.color };
}
