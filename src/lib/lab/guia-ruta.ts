import { estadoSpriteEn, type Plano, type SpriteEnCapa } from "@/lib/lab/sprite-capa";

// La guía de la ruta: los puntos y las líneas que se pintan ENCIMA de la
// escena para ver por dónde va a pasar algo.
//
// Solo se dibuja en la vista previa: nunca entra al PNG ni al ZIP. Es una
// ayuda para colocar, no parte de la escena.

export function pintarGuiaRuta(c: CanvasRenderingContext2D, spr: SpriteEnCapa, plano: Plano, tiempo: number) {
  if (!spr.trayectoria && !spr.ruta?.pasos.length) return;
  const puntos: { x: number; y: number; etiqueta: string; pausas: number[]; giros: number }[] = [
    { x: spr.x, y: spr.y, etiqueta: "A", pausas: [], giros: 0 },
  ];
  if (spr.ruta?.pasos.length) {
    spr.ruta.pasos.forEach((paso, i) => {
      if (paso.tipo === "mover") {
        const previo = puntos[puntos.length - 1];
        puntos.push({
          x: paso.x ?? previo.x,
          y: paso.y ?? previo.y,
          etiqueta: String(i + 1),
          pausas: [],
          giros: 0,
        });
      } else if (paso.tipo === "pausa") {
        puntos[puntos.length - 1].pausas.push(paso.segundos);
      } else {
        puntos[puntos.length - 1].giros++;
      }
    });
  } else if (spr.trayectoria) {
    puntos.push({ x: spr.trayectoria.x, y: spr.trayectoria.y, etiqueta: "B", pausas: [], giros: 0 });
  }

  const px = (x: number) => plano.x0 + x * plano.w;
  const py = (y: number) => plano.y0 + y * plano.h;
  const u = Math.max(1, Math.min(2.5, plano.w / 850));
  c.save();
  c.globalAlpha = 0.92;
  c.lineWidth = 2 * u;
  c.strokeStyle = "#22d3c5";
  c.setLineDash([7 * u, 5 * u]);
  c.beginPath();
  puntos.forEach((p, i) => {
    if (i) c.lineTo(px(p.x), py(p.y));
    else c.moveTo(px(p.x), py(p.y));
  });
  c.stroke();
  if (spr.ruta?.bucle && puntos.length > 1) {
    const primero = puntos[0];
    const ultimo = puntos[puntos.length - 1];
    if (primero.x !== ultimo.x || primero.y !== ultimo.y) {
      c.strokeStyle = "#f59e0b";
      c.setLineDash([2 * u, 7 * u]);
      c.beginPath();
      c.moveTo(px(ultimo.x), py(ultimo.y));
      c.lineTo(px(primero.x), py(primero.y));
      c.stroke();
    }
  }

  c.setLineDash([]);
  c.font = `600 ${11 * u}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (const p of puntos) {
    const x = px(p.x), y = py(p.y);
    c.fillStyle = "#071415";
    c.strokeStyle = "#5eead4";
    c.lineWidth = 2 * u;
    c.beginPath();
    c.arc(x, y, 9 * u, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#ccfbf1";
    c.fillText(p.etiqueta, x, y + 0.5 * u);
    if (p.pausas.length || p.giros) {
      const nota = `${p.giros ? "↔ " : ""}${p.pausas.length ? `⏸ ${p.pausas.reduce((a, b) => a + b, 0).toFixed(1)}s` : ""}`.trim();
      const ancho = Math.max(28, nota.length * 6.5) * u;
      c.fillStyle = "rgba(7,20,21,.9)";
      c.fillRect(x + 11 * u, y - 10 * u, ancho, 17 * u);
      c.fillStyle = "#fbbf24";
      c.textAlign = "left";
      c.fillText(nota, x + 14 * u, y - 1 * u);
      c.textAlign = "center";
    }
  }

  const actual = estadoSpriteEn(spr, tiempo);
  c.strokeStyle = "#fb923c";
  c.lineWidth = 3 * u;
  c.beginPath();
  c.arc(px(actual.x), py(actual.y), 14 * u, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}
