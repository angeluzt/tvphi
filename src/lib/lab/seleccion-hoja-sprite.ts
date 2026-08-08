// Selecciones sobre la hoja ANTES de cortarla. Este archivo no conoce canvas:
// las operaciones geométricas se pueden probar sin navegador y el componente
// decide después cómo pintar o mover los píxeles seleccionados.

export interface PuntoHoja {
  x: number;
  y: number;
}

export interface MascaraHoja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** 1 = el píxel pertenece al elemento; coordenadas relativas a la caja. */
  mascara: Uint8Array;
  pixeles: number;
}

export interface OpcionesFondo {
  color: [number, number, number];
  tolerancia: number;
  /** En hojas transparentes solo manda el alfa; no se confunde magenta real. */
  usarCroma?: boolean;
}

const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));

function detectorFigura(datos: Uint8ClampedArray, fondo: OpcionesFondo) {
  // El modelo rara vez entrega un magenta matemáticamente plano: puede venir
  // más oscuro, con degradado o comprimido. La distancia RGB diría que todo
  // eso es «figura». También medimos cuánto sobresale el TONO del croma, igual
  // que el quitafondos: para magenta, cuánto superan rojo/azul al verde.
  const maxBase = Math.max(...fondo.color);
  const altos = [0, 1, 2].filter((i) => fondo.color[i] >= maxBase * 0.5);
  const bajos = [0, 1, 2].filter((i) => fondo.color[i] < maxBase * 0.5);
  const fuerza = (p: ArrayLike<number>, inicio: number) => {
    let alto = 255;
    for (const i of altos) alto = Math.min(alto, p[inicio + i]);
    let bajo = 0;
    for (const i of bajos) bajo = Math.max(bajo, p[inicio + i]);
    return alto - bajo;
  };
  const k = fuerza(fondo.color, 0);
  // Una sensibilidad alta considera fondo incluso un borde muy mezclado; una
  // baja conserva más pelo/patas, a costa de poder llevarse ruido cromático.
  const limite = Math.max(0.08, Math.min(0.75, 0.62 - fondo.tolerancia / 180));
  const tol2 = fondo.tolerancia * fondo.tolerancia;

  // altos/bajos y K se calculan UNA sola vez. Una selección automática puede
  // visitar más de un millón de píxeles en móvil; crearlos por píxel congelaría
  // la interfaz y multiplicaría innecesariamente la memoria temporal.
  return (indicePixel: number) => {
    const o = indicePixel * 4;
    if (datos[o + 3] < 24) return false;
    if (fondo.usarCroma === false) return true;
    const dr = datos[o] - fondo.color[0];
    const dg = datos[o + 1] - fondo.color[1];
    const db = datos[o + 2] - fondo.color[2];
    if (dr * dr + dg * dg + db * db <= tol2) return false;
    if (!bajos.length || k < 40) return true;
    return fuerza(datos, o) / k < limite;
  };
}

function recortarMascara(mascara: Uint8Array, ancho: number, alto: number): MascaraHoja | null {
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1, pixeles = 0;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (!mascara[y * ancho + x]) continue;
      pixeles++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!pixeles) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const corta = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      corta[y * w + x] = mascara[(y0 + y) * ancho + x0 + x];
    }
  }
  return { x: x0, y: y0, ancho: w, alto: h, mascara: corta, pixeles };
}

/** Encuentra una semilla cercana por si el toque cayó en un hueco del dibujo. */
function semillaCercana(
  ancho: number,
  alto: number,
  x: number,
  y: number,
  esFigura: (indicePixel: number) => boolean,
) {
  const sx = acotar(x, 0, ancho - 1);
  const sy = acotar(y, 0, alto - 1);
  if (esFigura(sy * ancho + sx)) return { x: sx, y: sy };
  for (let radio = 1; radio <= 10; radio++) {
    for (let dy = -radio; dy <= radio; dy++) {
      for (let dx = -radio; dx <= radio; dx++) {
        if (Math.abs(dx) !== radio && Math.abs(dy) !== radio) continue;
        const px = sx + dx, py = sy + dy;
        if (px < 0 || py < 0 || px >= ancho || py >= alto) continue;
        if (esFigura(py * ancho + px)) return { x: px, y: py };
      }
    }
  }
  return null;
}

/** Selecciona la silueta no-croma conectada al píxel pulsado (8 vecinos). */
export function seleccionarComponenteHoja(
  datos: Uint8ClampedArray,
  ancho: number,
  alto: number,
  x: number,
  y: number,
  fondo: OpcionesFondo,
): MascaraHoja | null {
  if (ancho < 1 || alto < 1 || datos.length < ancho * alto * 4) return null;
  const esFigura = detectorFigura(datos, fondo);
  const semilla = semillaCercana(ancho, alto, x, y, esFigura);
  if (!semilla) return null;
  const visitados = new Uint8Array(ancho * alto);
  const cola = new Int32Array(ancho * alto);
  let inicio = 0, fin = 0;
  cola[fin++] = semilla.y * ancho + semilla.x;
  visitados[cola[0]] = 1;
  while (inicio < fin) {
    const p = cola[inicio++];
    const px = p % ancho;
    const py = Math.floor(p / ancho);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const q = ny * ancho + nx;
        if (visitados[q] || !esFigura(q)) continue;
        visitados[q] = 1;
        cola[fin++] = q;
      }
    }
  }
  return recortarMascara(visitados, ancho, alto);
}

/** Selecciona todo píxel no-croma dentro de un rectángulo. */
export function seleccionarRectanguloHoja(
  datos: Uint8ClampedArray,
  ancho: number,
  alto: number,
  a: PuntoHoja,
  b: PuntoHoja,
  fondo: OpcionesFondo,
): MascaraHoja | null {
  const esFigura = detectorFigura(datos, fondo);
  const x0 = acotar(Math.min(a.x, b.x), 0, ancho - 1);
  const y0 = acotar(Math.min(a.y, b.y), 0, alto - 1);
  const x1 = acotar(Math.max(a.x, b.x), 0, ancho - 1);
  const y1 = acotar(Math.max(a.y, b.y), 0, alto - 1);
  const mascara = new Uint8Array(ancho * alto);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = y * ancho + x;
      if (esFigura(p)) mascara[p] = 1;
    }
  }
  return recortarMascara(mascara, ancho, alto);
}

function dentroPoligono(x: number, y: number, puntos: PuntoHoja[]) {
  let dentro = false;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const a = puntos[i], b = puntos[j];
    const cruza = ((a.y > y) !== (b.y > y))
      && x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Selección manual precisa: conserva solo figura dentro del lazo cerrado. */
export function seleccionarLazoHoja(
  datos: Uint8ClampedArray,
  ancho: number,
  alto: number,
  puntos: PuntoHoja[],
  fondo: OpcionesFondo,
): MascaraHoja | null {
  if (puntos.length < 3) return null;
  const esFigura = detectorFigura(datos, fondo);
  const mascara = new Uint8Array(ancho * alto);
  const x0 = acotar(Math.min(...puntos.map((p) => p.x)), 0, ancho - 1);
  const y0 = acotar(Math.min(...puntos.map((p) => p.y)), 0, alto - 1);
  const x1 = acotar(Math.max(...puntos.map((p) => p.x)), 0, ancho - 1);
  const y1 = acotar(Math.max(...puntos.map((p) => p.y)), 0, alto - 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = y * ancho + x;
      if (dentroPoligono(x + 0.5, y + 0.5, puntos) && esFigura(p)) {
        mascara[p] = 1;
      }
    }
  }
  return recortarMascara(mascara, ancho, alto);
}

/** Mantiene la selección entera dentro de la hoja. */
export function acotarMovimientoSeleccion(
  seleccion: Pick<MascaraHoja, "x" | "y" | "ancho" | "alto">,
  dx: number,
  dy: number,
  anchoHoja: number,
  altoHoja: number,
) {
  return {
    dx: acotar(dx, -seleccion.x, anchoHoja - seleccion.x - seleccion.ancho),
    dy: acotar(dy, -seleccion.y, altoHoja - seleccion.y - seleccion.alto),
  };
}
