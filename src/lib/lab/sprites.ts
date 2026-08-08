import { cargarImagen, colorDelFondo, parseHex, quitarColor, CROMA } from "@/lib/lab/quitar-fondo";

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
function cajaDe(d: Uint8ClampedArray, w: number, h: number) {
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
  /** Margen a dejar alrededor del recorte, en tanto por uno. */
  aire?: number;
}): Promise<HojaCortada> {
  const img = await cargarImagen(opts.dataUrl);
  const n = Math.max(1, opts.fotogramas);
  const columna = opts.forma === "columna";
  const cw = columna ? img.naturalWidth : img.naturalWidth / n;
  const ch = columna ? img.naturalHeight / n : img.naturalHeight;

  // 1 · Cortar y limpiar cada celda.
  const celdas: { cv: HTMLCanvasElement; datos: Uint8ClampedArray }[] = [];
  let color: string | undefined;

  for (let i = 0; i < n; i++) {
    const cv = lienzo(cw, ch);
    const c = cv.getContext("2d")!;
    c.drawImage(
      img,
      columna ? 0 : i * cw, columna ? i * ch : 0, cw, ch,
      0, 0, cv.width, cv.height,
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

  if (!caja) return { fotogramas: [], descartados: n, color };

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

  return { fotogramas, descartados, color };
}

/** Nombre de archivo para un sprite, a partir de lo que se pidió. */
export const nombreSprite = (que: string) =>
  (que || "sprite").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "sprite";
