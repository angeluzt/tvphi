"use client";

import { useEffect, useRef, useState } from "react";

// El sprite en marcha, sobre un tablero de ajedrez.
//
// El tablero no es decoración: un bicho oscuro sobre fondo oscuro parece que no
// está, y sin él no hay forma de ver si la transparencia salió bien —que es
// justo lo que hay que mirar en un sprite recién hecho—.
//
// Se pinta desde la TIRA, con `drawImage` de nueve argumentos. Ni se parte la
// imagen ni se guardan doce copias en memoria: se dibuja el trozo que toca.

export function VistaSprite({ tira, fotogramas, fps, andando = true, tam = 160 }: {
  /** URL del PNG con los fotogramas en fila. */
  tira: string;
  fotogramas: number;
  fps: number;
  andando?: boolean;
  tam?: number;
}) {
  const [i, setI] = useState(0);
  const img = useRef<HTMLImageElement | null>(null);
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const [listo, setListo] = useState(0);

  useEffect(() => {
    let vivo = true;
    const im = new Image();
    im.onload = () => { if (vivo) { img.current = im; setListo((v) => v + 1); } };
    im.src = tira;
    return () => { vivo = false; };
  }, [tira]);

  useEffect(() => {
    if (!andando || fotogramas < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % fotogramas), 1000 / Math.max(1, fps));
    return () => clearInterval(t);
  }, [andando, fps, fotogramas]);

  useEffect(() => {
    const cv = lienzo.current;
    const im = img.current;
    if (!cv) return;
    const c = cv.getContext("2d")!;
    const p = 8;
    for (let y = 0; y < cv.height; y += p) {
      for (let x = 0; x < cv.width; x += p) {
        c.fillStyle = ((x / p + y / p) % 2 === 0) ? "#171d20" : "#0f1416";
        c.fillRect(x, y, p, p);
      }
    }
    if (!im) return;
    const fw = im.naturalWidth / Math.max(1, fotogramas);
    const fh = im.naturalHeight;
    // Se encaja por el lado que sobre, sin deformar: un pájaro estirado para
    // llenar el cuadro no se parece al pájaro que se va a usar.
    const e = Math.min(cv.width / fw, cv.height / fh);
    const w = fw * e, h = fh * e;
    const cual = Math.min(i, fotogramas - 1);
    c.drawImage(im, cual * fw, 0, fw, fh, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }, [i, fotogramas, listo]);

  return (
    <canvas
      ref={lienzo}
      width={tam}
      height={tam}
      className="shrink-0 rounded-lg border border-border"
      aria-label="Vista previa del sprite"
    />
  );
}
