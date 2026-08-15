import { nanoid } from "nanoid";
import { pngBase64ABlob } from "@/lib/lab/png-base64";
import { pedirJsonCrudo } from "@/lib/pedir-json";
import { MAX_FOTOS_LOOP, MIN_FOTOS_LOOP, type LoopImagen } from "./medio";

// Pedir fotogramas de un loop (escena o lámina) uno a uno.
//
// Siempre se usa la PRIMERA imagen como referencia: encadenar cada cuadro
// al anterior acumula deriva y al quinto ya no es la misma cara.

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

export async function pedirFotograma(opts: {
  prompt: string;
  imagen: string;
  formato: "16:9" | "9:16" | "1:1";
  calidad?: "low" | "medium" | "high";
  movimiento?: string;
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
    }),
  });
  if (!r.ok) throw new Error(j.error || "No se pudo dibujar el fotograma");
  if (!j.imagen) throw new Error("El servidor contestó sin imagen");
  return pngBase64ABlob(j.imagen);
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
}): Promise<LoopImagen> {
  const n = Math.max(MIN_FOTOS_LOOP, Math.min(MAX_FOTOS_LOOP, Math.round(opts.n)));
  const ref = await blobAPngDataUrl(opts.still);
  const ids = [opts.stillId];
  for (let i = 1; i < n; i++) {
    opts.onPaso?.(`Fotograma ${i + 1} de ${n}…`);
    const blob = await pedirFotograma({
      prompt: opts.prompt,
      imagen: ref,
      formato: opts.formato,
      calidad: opts.calidad,
      movimiento: opts.movimiento,
    });
    const id = await opts.guardar(blob, `loop-${nanoid(6)}`);
    ids.push(id);
  }
  return { imageIds: ids, fps: opts.fps };
}
