import { cargarImagen, colorDelFondo, parseHex, quitarColor, CROMA } from "./quitar-fondo";

// Partir una hoja de sprites en fotogramas sueltos, limpios y recortados.
//
// La hoja llega como UNA imagen con el bicho repetido en celdas. Aquí se corta,
// se le quita el magenta y se recorta lo que sobra. El recorte no es cosmético:
// si cada fotograma conserva su celda entera, el bicho baila dentro del marco y
// la animación tiembla aunque los dibujos sean buenos.
//
// LOS FOTOGRAMAS SE RECORTAN JUNTOS, con la misma caja para todos. Recortar
// cada uno por su cuenta es lo que hace que el pájaro dé saltos: si en uno las
// alas están arriba y en otro abajo, sus cajas son distintas y al alinearlos el
// cuerpo se mueve. Con una caja común, lo único que cambia entre fotogramas es
// lo que el dibujo quiso que cambiara.

export interface Fotograma {
  /** PNG ya sin fondo y recortado. */
  url: string;
  ancho: number;
  alto: number;
  /** Porcentaje de píxeles con algo. Sirve para descartar celdas vacías. */
  lleno: number;
}

export interface HojaCortada {
  fotogramas: Fotograma[];
  /** Los que salieron vacíos y se descartaron. */
  descartados: number;
  /** El color que se quitó, para poder decirlo. */
  color?: string;
  /** Rectángulos de la hoja original que se usaron, en el mismo orden. */
  celdas: CeldaSprite[];
}

/** Un recorte sobre la hoja ORIGINAL, antes de quitar el fondo o centrar. */
export interface CeldaSprite {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface CajaContenido {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const lienzo = (w: number, h: number) => {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  return cv;
};

/** Cuánto del recorte tiene algo dibujado. */
function llenoDe(d: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 24) n++;
  return d.length ? n / (d.length / 4) : 0;
}

/** La caja de lo que NO es transparente. Null si no hay nada. */
export function cajaDe(d: Uint8ClampedArray, w: number, h: number): CajaContenido | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Los limites enteros de una celda dentro de una hoja.
 *
 * No se usa `total / n` directamente en drawImage: si el ancho no es divisible
 * entre los fotogramas, el navegador interpola desde media columna del cuadro
 * vecino y aparece una raya o una mancha que parece pertenecer al siguiente.
 */
export function limitesCelda(total: number, n: number, i: number) {
  const cuantos = Math.max(1, Math.round(n));
  const cual = Math.max(0, Math.min(cuantos - 1, Math.round(i)));
  const inicio = Math.round((cual * total) / cuantos);
  const fin = Math.round(((cual + 1) * total) / cuantos);
  return { inicio, tam: Math.max(1, fin - inicio) };
}

/** Rejilla inicial: cubre la hoja entera sin perder ni repetir un píxel. */
export function celdasSpritePorDefecto(
  ancho: number,
  alto: number,
  fotogramas: number,
  forma: "tira" | "columna",
): CeldaSprite[] {
  const n = Math.max(1, Math.round(fotogramas));
  return Array.from({ length: n }, (_, i) => {
    const lx = forma === "columna"
      ? { inicio: 0, tam: ancho }
      : limitesCelda(ancho, n, i);
    const ly = forma === "columna"
      ? limitesCelda(alto, n, i)
      : { inicio: 0, tam: alto };
    return { x: lx.inicio, y: ly.inicio, ancho: lx.tam, alto: ly.tam };
  });
}

/** Acota recortes importados o movidos para que nunca lean fuera de la hoja. */
export function normalizarCeldasSprite(
  celdas: CeldaSprite[],
  anchoHoja: number,
  altoHoja: number,
): CeldaSprite[] {
  const aw = Math.max(1, Math.round(anchoHoja));
  const ah = Math.max(1, Math.round(altoHoja));
  return celdas.slice(0, 24).map((c) => {
    // Primero manda el tamaño y después se acota la posición. Así arrastrar
    // una celda contra el borde la DETIENE, no la encoge silenciosamente.
    const ancho = Math.max(1, Math.min(aw, Math.round(Number(c?.ancho) || 1)));
    const alto = Math.max(1, Math.min(ah, Math.round(Number(c?.alto) || 1)));
    const x = Math.max(0, Math.min(aw - ancho, Math.round(Number(c?.x) || 0)));
    const y = Math.max(0, Math.min(ah - alto, Math.round(Number(c?.y) || 0)));
    return { x, y, ancho, alto };
  });
}

/**
 * Cambia el tamaño de TODOS los recortes a la vez y conserva sus posiciones.
 * Cada posición se acota por separado para que ninguna celda salga de la hoja.
 */
export function tamanoComunCeldasSprite(
  celdas: CeldaSprite[],
  anchoHoja: number,
  altoHoja: number,
  ancho: number,
  alto: number,
): CeldaSprite[] {
  const aw = Math.max(1, Math.round(anchoHoja));
  const ah = Math.max(1, Math.round(altoHoja));
  const comunAncho = Math.max(1, Math.min(aw, Math.round(ancho)));
  const comunAlto = Math.max(1, Math.min(ah, Math.round(alto)));
  return normalizarCeldasSprite(
    celdas.map((c) => ({ ...c, ancho: comunAncho, alto: comunAlto })),
    aw,
    ah,
  );
}

/** Cuanto hay que mover una silueta para que su caja quede en el centro. */
export function desplazamientoParaCentrar(
  caja: CajaContenido,
  ancho: number,
  alto: number,
) {
  return {
    x: Math.round(ancho / 2 - (caja.x0 + caja.x1 + 1) / 2),
    y: Math.round(alto / 2 - (caja.y0 + caja.y1 + 1) / 2),
  };
}

/** Convierte un canvas corregido en el fotograma que usa el resto del motor. */
export function fotogramaDeLienzo(cv: HTMLCanvasElement): Fotograma {
  const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
  return {
    url: cv.toDataURL("image/png"),
    ancho: cv.width,
    alto: cv.height,
    lleno: llenoDe(d),
  };
}

/**
 * Corta la hoja en fotogramas.
 *
 * `croma` es el color que se PIDIÓ. Se intenta primero adivinarlo del borde
 * —que es más fiable cuando el modelo se desvía de tono— y si el borde no
 * convence, se usa el pedido.
 */
export async function cortarHoja(opts: {
  dataUrl: string;
  fotogramas: number;
  forma: "tira" | "columna";
  croma?: string;
  /** Si viene, reemplaza la rejilla igual: son recortes sobre la hoja original. */
  celdas?: CeldaSprite[];
  /** Margen a dejar alrededor del recorte, en tanto por uno. */
  aire?: number;
}): Promise<HojaCortada> {
  const img = await cargarImagen(opts.dataUrl);
  const propuestas = opts.celdas?.length
    ? opts.celdas
    : celdasSpritePorDefecto(img.naturalWidth, img.naturalHeight, opts.fotogramas, opts.forma);
  const celdasFuente = normalizarCeldasSprite(propuestas, img.naturalWidth, img.naturalHeight);
  const n = celdasFuente.length;
  if (!n) return { fotogramas: [], descartados: 0, celdas: [] };
  // Todas las celdas se llevan al mismo lienzo sin escalar. Cuando la division
  // o el ajuste manual dejan un pixel de diferencia, se centra ese pixel: no
  // se roba contenido al fotograma contiguo y tampoco se deforma el dibujo.
  const cw = Math.max(...celdasFuente.map((c) => c.ancho));
  const ch = Math.max(...celdasFuente.map((c) => c.alto));

  // 1 · Cortar y limpiar cada celda.
  const celdas: { cv: HTMLCanvasElement; datos: Uint8ClampedArray }[] = [];
  let color: string | undefined;

  for (const celda of celdasFuente) {
    const cv = lienzo(cw, ch);
    const c = cv.getContext("2d")!;
    c.drawImage(
      img,
      celda.x, celda.y, celda.ancho, celda.alto,
      Math.floor((cv.width - celda.ancho) / 2),
      Math.floor((cv.height - celda.alto) / 2),
      celda.ancho, celda.alto,
    );
    const d0 = c.getImageData(0, 0, cv.width, cv.height).data;
    // El croma se busca celda a celda: el modelo a veces vira el tono de un
    // extremo a otro de la hoja, y con un solo color se quedaría medio rosa.
    const base = colorDelFondo(d0, cv.width, cv.height)
      ?? parseHex(opts.croma ?? "") ?? parseHex(CROMA);
    if (base) {
      const r = quitarColor(cv, base);
      color = color ?? r.color;
    }
    celdas.push({ cv, datos: c.getImageData(0, 0, cv.width, cv.height).data });
  }

  // 2 · Una caja COMÚN, con lo que tienen todos los fotogramas que valen.
  let caja: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let descartados = 0;
  const vale: boolean[] = [];
  celdas.forEach(({ cv, datos }) => {
    const lleno = llenoDe(datos);
    // Una celda casi vacía es una que el modelo no dibujó. Meterla en la
    // animación es un parpadeo en medio del ciclo.
    const sirve = lleno > 0.004;
    vale.push(sirve);
    if (!sirve) { descartados++; return; }
    const c = cajaDe(datos, cv.width, cv.height);
    if (!c) { vale[vale.length - 1] = false; descartados++; return; }
    caja = caja
      ? { x0: Math.min(caja.x0, c.x0), y0: Math.min(caja.y0, c.y0), x1: Math.max(caja.x1, c.x1), y1: Math.max(caja.y1, c.y1) }
      : c;
  });

  if (!caja) return { fotogramas: [], descartados: n, color, celdas: celdasFuente };

  const c0 = caja as { x0: number; y0: number; x1: number; y1: number };
  const aire = Math.max(0, Math.min(0.2, opts.aire ?? 0.04));
  const w0 = c0.x1 - c0.x0 + 1;
  const h0 = c0.y1 - c0.y0 + 1;
  const mx = Math.round(w0 * aire);
  const my = Math.round(h0 * aire);
  const rx = Math.max(0, c0.x0 - mx);
  const ry = Math.max(0, c0.y0 - my);
  const rw = Math.min(cw - rx, w0 + mx * 2);
  const rh = Math.min(ch - ry, h0 + my * 2);

  // 3 · Recortar todos con la misma caja.
  const fotogramas: Fotograma[] = [];
  celdas.forEach(({ cv }, i) => {
    if (!vale[i]) return;
    const out = lienzo(rw, rh);
    out.getContext("2d")!.drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh);
    const d = out.getContext("2d")!.getImageData(0, 0, out.width, out.height).data;
    fotogramas.push({
      url: out.toDataURL("image/png"),
      ancho: out.width,
      alto: out.height,
      lleno: llenoDe(d),
    });
  });

  return { fotogramas, descartados, color, celdas: celdasFuente };
}

/**
 * Pega los fotogramas en fila, en un solo PNG con transparencia.
 *
 * Es lo que se guarda en la biblioteca, y no la hoja original, por dos
 * razones. Una: la hoja lleva el magenta puesto, así que habría que repetir el
 * recorte en cada carga —y el recorte tiene umbrales, o sea que la misma hoja
 * podría dar fotogramas distintos el día que se toque uno—. Y dos: al pintar,
 * una tira se dibuja por trozos con un `drawImage` de seis argumentos, sin
 * partir nada y sin gastar memoria en N imágenes sueltas.
 *
 * Los fotogramas ya vienen todos del mismo tamaño porque se recortaron con una
 * caja común, así que la tira es exactamente `n × ancho`.
 */
export async function tiraDeFotogramas(fotos: Fotograma[]): Promise<{
  blob: Blob;
  ancho: number;
  alto: number;
  fotogramas: number;
}> {
  if (!fotos.length) throw new Error("No hay fotogramas que pegar.");
  const imgs = await Promise.all(fotos.map((f) => cargarImagen(f.url)));
  const ancho = imgs[0].naturalWidth;
  const alto = imgs[0].naturalHeight;
  const cv = lienzo(ancho * imgs.length, alto);
  const c = cv.getContext("2d")!;
  // Si alguno viniera con otro tamaño, se centra en su celda en vez de
  // deformarlo: estirar un fotograma para que cuadre es justo lo que hace que
  // la animación palpite.
  imgs.forEach((im, i) => {
    c.drawImage(
      im,
      i * ancho + Math.round((ancho - im.naturalWidth) / 2),
      Math.round((alto - im.naturalHeight) / 2),
    );
  });
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
  if (!blob) throw new Error("No se pudo componer la tira.");
  return { blob, ancho, alto, fotogramas: imgs.length };
}

/** Abre una tira guardada y recupera sus cuadros editables sin guardarlos sueltos. */
export async function fotogramasDeTira(dataUrl: string, fotogramas: number): Promise<Fotograma[]> {
  const img = await cargarImagen(dataUrl);
  const n = Math.max(1, Math.round(fotogramas));
  if (img.naturalWidth % n !== 0) {
    throw new Error("La tira del ZIP no se puede dividir en fotogramas iguales.");
  }
  const ancho = img.naturalWidth / n;
  const alto = img.naturalHeight;
  return Array.from({ length: n }, (_, i) => {
    const cv = lienzo(ancho, alto);
    cv.getContext("2d")!.drawImage(img, i * ancho, 0, ancho, alto, 0, 0, ancho, alto);
    return fotogramaDeLienzo(cv);
  });
}

/** Nombre de archivo para un sprite, a partir de lo que se pidió. */
export const nombreSprite = (que: string) =>
  (que || "sprite").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "sprite";
