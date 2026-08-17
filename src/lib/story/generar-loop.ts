import { nanoid } from "nanoid";
import { pngBase64ABlob } from "@/lib/lab/png-base64";
import { pedirJsonCrudo } from "@/lib/pedir-json";
import { derivaNotable, gananciaHaciaPatron, mediaDeLuma } from "./exposicion";
import { MAX_FOTOS_LOOP, MIN_FOTOS_LOOP, type LoopImagen } from "./medio";

// Pedir los fotogramas de un loop (escena o lámina) uno a uno.
//
// TRES COSAS QUE HACE Y NO SE VEN, y las tres salieron de que la foto viva
// «parpadeaba y no se animaba»:
//
//   · MANDA DOS REFERENCIAS. La foto ORIGINAL en cada llamada, además del
//     cuadro anterior. Encadenando a secas, cada edición reescribe la imagen
//     entera y al quinto cuadro la escena ha derivado de color y de detalle;
//     anclando solo al original, salen N variaciones sueltas sin movimiento.
//     Con las dos, la original manda en la identidad y la anterior en el gesto.
//
//   · IGUALA EL BRILLO. Cada cuadro se lleva a la exposición del original antes
//     de guardarlo. Sin esto, medio paso de diferencia entre fotogramas se ve
//     como que la IMAGEN ENTERA parpadea, y ese parpadeo tapa por completo el
//     movimiento pequeño que se estaba buscando.
//
//   · IGUALA EL TAMAÑO. Todos los cuadros se guardan con las medidas exactas
//     del original. El modelo devuelve el tamaño que le toca por formato
//     —1536×1024 aunque le mandes una foto de 2000×1500—, y el motor recorta
//     cada fotograma con SUS medidas: dos tamaños distintos son dos recortes
//     distintos, o sea un salto de encuadre en cada cambio de cuadro.

export async function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(blob);
  });
}

/** El endpoint de fotogramas solo acepta PNG. Un JPEG subido a mano se convierte. */
export async function blobAPngDataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (u8.length >= 4 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
    return blobADataUrl(new Blob([u8], { type: "image/png" }));
  }
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement("canvas");
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("No se pudo convertir la imagen a PNG.");
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return cv.toDataURL("image/png");
}

function lienzo(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Este navegador no da lienzo 2D.");
  return { c, ctx };
}

const aPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((ok, mal) => c.toBlob(
    (b) => (b ? ok(b) : mal(new Error("El navegador no pudo guardar el fotograma."))),
    "image/png",
  ));

export interface MedidaFoto { ancho: number; alto: number; luma: number }

/** Cuánto mide y cuánto brilla una imagen. Es el patrón contra el que se iguala. */
export async function medirFoto(blob: Blob): Promise<MedidaFoto> {
  const bmp = await createImageBitmap(blob);
  try {
    const { c, ctx } = lienzo(bmp.width, bmp.height);
    ctx.drawImage(bmp, 0, 0);
    void c;
    return {
      ancho: bmp.width,
      alto: bmp.height,
      luma: mediaDeLuma(ctx.getImageData(0, 0, bmp.width, bmp.height).data),
    };
  } finally {
    bmp.close?.();
  }
}

/**
 * El fotograma que devolvió el modelo, puesto a la medida y al brillo del original.
 *
 * Se rellena el lienzo y se recorta lo que sobra por los lados en vez de dejar
 * bandas: las proporciones se parecen mucho —el tamaño se pide según el formato
 * del proyecto— y un recorte del 2% no se ve, mientras que una banda negra que
 * aparece y desaparece en cada vuelta del bucle se ve muchísimo.
 */
export async function ajustarFotograma(bruto: Blob, patron: MedidaFoto): Promise<Blob> {
  const bmp = await createImageBitmap(bruto);
  try {
    const { ancho, alto } = patron;
    const { c, ctx } = lienzo(ancho, alto);
    const k = Math.max(ancho / bmp.width, alto / bmp.height);
    const dw = bmp.width * k;
    const dh = bmp.height * k;
    ctx.drawImage(bmp, (ancho - dw) / 2, (alto - dh) / 2, dw, dh);

    const luma = mediaDeLuma(ctx.getImageData(0, 0, ancho, alto).data);
    const g = gananciaHaciaPatron(patron.luma, luma);
    // Repintar cuesta un lienzo entero; por debajo de lo que se nota, no compensa.
    if (derivaNotable(g) && "filter" in ctx) {
      ctx.clearRect(0, 0, ancho, alto);
      ctx.filter = `brightness(${g})`;
      ctx.drawImage(bmp, (ancho - dw) / 2, (alto - dh) / 2, dw, dh);
      ctx.filter = "none";
    }
    return await aPng(c);
  } finally {
    bmp.close?.();
  }
}

export async function pedirFotograma(opts: {
  prompt: string;
  imagen: string;
  formato: "16:9" | "9:16" | "1:1";
  calidad?: "low" | "medium" | "high";
  movimiento?: string;
  /** La foto original, cuando `imagen` es el cuadro anterior. */
  ancla?: string;
  indice?: number;
  total?: number;
}): Promise<Blob> {
  const { datos: j, respuesta: r } = await pedirJsonCrudo("/api/story/ia/lab/fotograma", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      imagen: opts.imagen,
      formato: opts.formato,
      calidad: opts.calidad,
      movimiento: opts.movimiento,
      ancla: opts.ancla,
      indice: opts.indice,
      total: opts.total,
    }),
  });
  if (!r.ok) throw new Error(j.error || "No se pudo dibujar el fotograma");
  if (!j.imagen) throw new Error("El servidor contestó sin imagen");
  return pngBase64ABlob(j.imagen);
}

export interface InformeLoop {
  /** Brillo medido de cada cuadro ANTES de igualar. Para poder enseñar la deriva. */
  lumas: number[];
  /** Lo que se corrigió cada uno. 1 = no hizo falta. */
  ganancias: number[];
  /** Cuánto tardó cada llamada, en ms. */
  tiempos: number[];
}

export async function generarLoopDesdeStill(opts: {
  stillId: string;
  still: Blob;
  prompt: string;
  formato: "16:9" | "9:16" | "1:1";
  n: number;
  fps: number;
  calidad?: "low" | "medium" | "high";
  movimiento?: string;
  onPaso?: (s: string) => void;
  guardar: (blob: Blob, nombre: string) => Promise<string>;
  /** Números de cómo fue, para el botón de prueba. */
  onInforme?: (i: InformeLoop) => void;
}): Promise<LoopImagen> {
  const n = Math.max(MIN_FOTOS_LOOP, Math.min(MAX_FOTOS_LOOP, Math.round(opts.n)));
  const patron = await medirFoto(opts.still);
  // La original se manda en TODAS las llamadas: es el ancla de identidad.
  const original = await blobAPngDataUrl(opts.still);
  let anterior = original;
  const ids = [opts.stillId];
  const informe: InformeLoop = { lumas: [patron.luma], ganancias: [1], tiempos: [0] };

  for (let i = 1; i < n; i++) {
    opts.onPaso?.(`Fotograma ${i + 1} de ${n}…`);
    const t0 = Date.now();
    const bruto = await pedirFotograma({
      prompt: opts.prompt,
      imagen: anterior,
      ancla: original,
      indice: i,
      total: n,
      formato: opts.formato,
      calidad: opts.calidad,
      movimiento: opts.movimiento,
    });
    informe.tiempos.push(Date.now() - t0);

    const medida = await medirFoto(bruto);
    informe.lumas.push(medida.luma);
    informe.ganancias.push(gananciaHaciaPatron(patron.luma, medida.luma));

    const cuadro = await ajustarFotograma(bruto, patron);
    ids.push(await opts.guardar(cuadro, `loop-${nanoid(6)}`));
    // El siguiente ve ESTE ya corregido, no el bruto: si se encadena el bruto,
    // la deriva de brillo se hereda y la corrección de cada cuadro es cada vez
    // mayor hasta chocar con el tope.
    anterior = await blobAPngDataUrl(cuadro);
  }
  opts.onInforme?.(informe);
  // Vaivén encendido: los cuadros están encadenados, así que el último se
  // parece al penúltimo y no al primero. Cortando del último al primero, el
  // mayor salto del ciclo se repite una vez por vuelta.
  return { imageIds: ids, fps: opts.fps, vaiven: true };
}
