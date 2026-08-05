// Dejar una capa sin fondo, para poder apilarla.
//
// EL PLAN A es pedirle al modelo la imagen ya con transparencia
// (background: "transparent" en la API de imágenes). Cuando funciona, sale
// perfecta: bordes limpios, pelo, humo, todo.
//
// EL PLAN B es para cuando el modelo lo ignora y devuelve la imagen opaca, que
// pasa. Entonces se le ha pedido en el prompt que use un fondo PLANO de un
// color raro, y aquí se le quita. No es tan bueno como la transparencia de
// verdad —los bordes finos sufren— pero es mucho mejor que tirar la imagen.
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

/**
 * Quita el color de fondo con un borde suave y le baja el tinte a lo que queda.
 *
 * Lo del tinte («despill») importa más de lo que parece: sobre un fondo magenta,
 * el borde del dibujo queda rosado, y al montarlo sobre otra capa se ve un halo
 * de color que delata el recorte. Se le quita restándole al canal dominante del
 * croma lo que le sobra respecto a los otros dos.
 */
export function quitarColor(
  cv: HTMLCanvasElement, base: [number, number, number],
  dentro = 34, fuera = 92,
) {
  const c = cv.getContext("2d")!;
  const im = c.getImageData(0, 0, cv.width, cv.height);
  const d = im.data;
  // Qué canal domina el croma: es el que hay que rebajar en los bordes.
  const dom = base.indexOf(Math.max(...base));
  const otros = [0, 1, 2].filter((k) => k !== dom);

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const p: [number, number, number] = [d[i], d[i + 1], d[i + 2]];
    const q = dist(p, base);
    if (q <= dentro) { d[i + 3] = 0; continue; }
    if (q < fuera) {
      // Zona de transición: medio transparente, para que el borde no quede
      // en escalera.
      const t = (q - dentro) / (fuera - dentro);
      d[i + 3] = Math.round(d[i + 3] * t);
      const media = (p[otros[0]] + p[otros[1]]) / 2;
      if (p[dom] > media) d[i + dom] = Math.round(media + (p[dom] - media) * t * 0.4);
    }
  }
  c.putImageData(im, 0, 0);
  return { vacio: huecoDe(d), color: hex(base) };
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
