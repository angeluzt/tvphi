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
  /** Si existe, la capa no debe montarse: conserva el color técnico. */
  problema?: "croma-en-fondo" | "croma-residual";
  /** Fracción del lienzo que todavía parece croma después del proceso. */
  residuoCroma?: number;
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
  //
  //    Si el borde está CLARAMENTE dominado por el color (≥55%), bastan 2
  //    esquinas: la capa delantera casi siempre pisa una o dos (pies, cabeza)
  //    y con exigir 3 se quedaba rosa y opaca.
  const esquinas = [px(1, 1), px(w - 2, 1), px(1, h - 2), px(w - 2, h - 2)];
  const iguales = esquinas.filter((c) => c && dist(c, base) < 42).length;
  const bordeFuerte = cerca / muestras.length >= 0.55;
  if (iguales < (bordeFuerte ? 2 : 3)) return null;

  return base;
}

const dist = (a: [number, number, number], b: [number, number, number]) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

const hex = (c: [number, number, number]) =>
  "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

/** "#FF00FF" → [255,0,255]. Null si no es un hex de 6 dígitos. */
export function parseHex(s: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Qué fracción de la imagen se parece a ese color.
 * Sirve para decidir si el magenta pedido al modelo SÍ está, aunque el dibujo
 * tape las esquinas y el detector de borde diga que no hay croma.
 */
export function fraccionCroma(
  d: Uint8ClampedArray, w: number, h: number,
  base: [number, number, number], radio = 48,
) {
  const paso = Math.max(1, Math.floor(Math.min(w, h) / 64));
  let ok = 0, total = 0;
  for (let y = 0; y < h; y += paso) {
    for (let x = 0; x < w; x += paso) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 128) continue;
      total++;
      if (dist([d[i], d[i + 1], d[i + 2]], base) < radio) ok++;
    }
  }
  return total ? ok / total : 0;
}

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

interface ModeloCroma {
  altos: number[];
  bajos: number[];
  k: number;
}

function modeloCroma(base: [number, number, number]): ModeloCroma {
  const max = Math.max(...base);
  const altos = [0, 1, 2].filter((i) => base[i] >= max * 0.5);
  const bajos = [0, 1, 2].filter((i) => base[i] < max * 0.5);
  return { altos, bajos, k: bajos.length ? sobra(base, 0, altos, bajos) : 0 };
}

/**
 * Fuerza del tono técnico, de 0 a 1.
 *
 * No mide distancia a #FF00FF. Un fondo sombreado (230,57,235) sigue siendo
 * inequívocamente magenta aunque esté muy lejos del RGB pedido. Lo que importa
 * es que los dos canales altos continúen dominando al canal bajo.
 */
function fuerzaCroma(
  d: ArrayLike<number>, i: number, modelo: ModeloCroma,
) {
  if (modelo.k < 40 || d[i + 3] < 16) return 0;
  let minimoAlto = 255;
  for (const canal of modelo.altos) minimoAlto = Math.min(minimoAlto, d[i + canal]);
  // Un negro o un color casi negro no adquiere tono por tener un canal dos
  // puntos por encima de otro. El suelo evita esos falsos positivos.
  if (minimoAlto < 36) return 0;
  return Math.max(0, Math.min(1.25, sobra(d, i, modelo.altos, modelo.bajos) / modelo.k));
}

interface MascaraCroma {
  mascara: Uint8Array;
  suave: Uint8Array;
  modelo: ModeloCroma;
  conectados: number;
  nucleos: number;
}

/**
 * Encuentra el fondo real, no solo colores parecidos.
 *
 * 1. Empieza en píxeles cromados del borde.
 * 2. Recorre cada píxel conectado de la mancha.
 * 3. Tolera hasta tres píxeles débiles para abarcar antialias y compresión.
 * 4. También toma islas de croma casi puro: ese RGB está reservado y puede
 *    quedar encerrado entre ramas, ruedas o huecos de un edificio.
 *
 * La conectividad es la protección importante: un detalle violeta dentro del
 * objeto no desaparece solo por compartir tono con el fondo.
 */
function mascaraCroma(
  d: Uint8ClampedArray, w: number, h: number, base: [number, number, number],
): MascaraCroma {
  const total = Math.max(0, w * h);
  const mascara = new Uint8Array(total);
  const suave = new Uint8Array(total);
  suave.fill(255);
  const cola = new Int32Array(total);
  const modelo = modeloCroma(base);
  if (!total || modelo.k < 40) return { mascara, suave, modelo, conectados: 0, nucleos: 0 };

  let entra = 0, sale = 0, nucleos = 0;
  const poner = (p: number, nivel: number) => {
    if (mascara[p]) return;
    mascara[p] = 1; suave[p] = nivel; cola[entra++] = p;
  };
  const esBorde = (p: number) => {
    const x = p % w, y = Math.floor(p / w);
    return x === 0 || y === 0 || x === w - 1 || y === h - 1;
  };

  // Se recorren TODOS los píxeles. Además de sembrar el borde, esto encuentra
  // huecos cerrados de magenta puro que un flood-fill de esquinas no alcanzaría.
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (d[i + 3] < 16) continue;
    const f = fuerzaCroma(d, i, modelo);
    const puro = f >= 0.78 && dist([d[i], d[i + 1], d[i + 2]], base) < 150;
    // El diagnóstico global solo cuenta el color técnico casi puro. Un violeta
    // legítimo puede tener fuerza tonal alta, pero si está aislado y lejos del
    // RGB reservado no debe forzar un reintento de toda la imagen.
    if (puro) nucleos++;
    if ((esBorde(p) && f >= 0.28) || puro) poner(p, 0);
  }

  while (sale < entra) {
    const p = cola[sale++];
    const x = p % w;
    const vecinos = [p - w, p + w, x > 0 ? p - 1 : -1, x + 1 < w ? p + 1 : -1];
    for (const q of vecinos) {
      if (q < 0 || q >= total || mascara[q]) continue;
      const i = q * 4;
      if (d[i + 3] < 16) continue;
      const f = fuerzaCroma(d, i, modelo);
      if (f >= 0.28) {
        poner(q, 0);
      } else if (f >= 0.055 && suave[p] < 3) {
        // Solo tres pasos blandos: limpia el halo, pero no puede atravesar una
        // pieza completa únicamente porque tenga un leve reflejo magenta.
        poner(q, suave[p] + 1);
      }
    }
  }

  return { mascara, suave, modelo, conectados: entra, nucleos };
}

/** Diagnóstico puro y testeable del color técnico presente en una imagen. */
export function diagnosticarCroma(
  d: Uint8ClampedArray, w: number, h: number, base: [number, number, number],
) {
  const r = mascaraCroma(d, w, h, base);
  const total = Math.max(1, w * h);
  return {
    conectado: r.conectados / total,
    nucleo: r.nucleos / total,
  };
}

/**
 * Color dominante dentro del rectángulo que marcó la persona.
 *
 * Agrupa variaciones cercanas para que un JPG o un degradado rosa cuente como
 * una sola mancha. Los píxeles ya transparentes no votan: importa el residuo
 * visible que todavía necesita corrección.
 */
export function colorDominanteEnArea(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): [number, number, number] | null {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(Math.min(a.x, b.x))));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(Math.min(a.y, b.y))));
  const x1 = Math.max(x0, Math.min(w - 1, Math.ceil(Math.max(a.x, b.x))));
  const y1 = Math.max(y0, Math.min(h - 1, Math.ceil(Math.max(a.y, b.y))));
  const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  const paso = Math.max(1, Math.floor(Math.sqrt(area / 40_000)));
  const grupos = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = y0; y <= y1; y += paso) {
    for (let x = x0; x <= x1; x += paso) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 24) continue;
      const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
      const grupo = grupos.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      grupo.n++; grupo.r += d[i]; grupo.g += d[i + 1]; grupo.b += d[i + 2];
      grupos.set(k, grupo);
    }
  }
  const mejor = [...grupos.values()].sort((x, y) => y.n - x.n)[0];
  return mejor
    ? [Math.round(mejor.r / mejor.n), Math.round(mejor.g / mejor.n), Math.round(mejor.b / mejor.n)]
    : null;
}

/**
 * Versión sobre datos crudos: la usa el canvas y permite probar el algoritmo
 * sin depender del DOM. Devuelve cuánto quitó y cuánto croma visible queda.
 */
export function quitarColorDePixeles(
  d: Uint8ClampedArray, w: number, h: number, base: [number, number, number],
) {
  const r = mascaraCroma(d, w, h, base);
  if (r.modelo.k < 40) {
    porDistancia(d, base);
    return { eliminados: 0, residuo: 0 };
  }

  let eliminados = 0;
  for (let p = 0; p < r.mascara.length; p++) {
    if (!r.mascara[p]) continue;
    const i = p * 4;
    const f = fuerzaCroma(d, i, r.modelo);
    if (r.suave[p] === 0) {
      if (d[i + 3]) eliminados++;
      d[i + 3] = 0;
      continue;
    }

    // Franja antialias: no se corta de golpe. Se estima cuánto objeto queda,
    // se resta el croma que lo contaminó y se conserva ese alfa.
    const cobertura = Math.max(0, Math.min(1, (0.32 - f) / 0.265));
    if (cobertura < 0.02) {
      if (d[i + 3]) eliminados++;
      d[i + 3] = 0;
      continue;
    }
    const inv = 1 / Math.max(cobertura, 0.25);
    d[i] = tope255((d[i] - (1 - cobertura) * base[0]) * inv);
    d[i + 1] = tope255((d[i + 1] - (1 - cobertura) * base[1]) * inv);
    d[i + 2] = tope255((d[i + 2] - (1 - cobertura) * base[2]) * inv);
    d[i + 3] = Math.round(d[i + 3] * cobertura);
  }

  // Una segunda lectura impide declarar éxito si el modelo inventó otra isla
  // grande de magenta que no quedó conectada al borde.
  const despues = diagnosticarCroma(d, w, h, base);
  return { eliminados, residuo: Math.max(despues.conectado, despues.nucleo) };
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

  const r = quitarColorDePixeles(d, cv.width, cv.height, base);
  c.putImageData(im, 0, 0);
  return { vacio: huecoDe(d), color: hex(base), ...r };
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
 *
 * `cromaPedido` es el color que la API le pidió al modelo (magenta). Si el
 * detector de borde falla —muy típico en la ÚLTIMA capa, la delantera, que
 * pisa esquinas—, se usa ese color si hay bastante en la imagen.
 */
export async function prepararCapa(
  dataUrl: string,
  esFondo: boolean,
  cromaPedido?: string | null,
): Promise<Recorte> {
  const img = await cargarImagen(dataUrl);
  const cv = lienzoDe(img);
  const c = cv.getContext("2d")!;
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  const vacio = huecoDe(d);
  const pedido = parseHex(cromaPedido ?? "");
  const diagnosticoPedido = pedido
    ? diagnosticarCroma(d, cv.width, cv.height, pedido)
    : null;
  const hayCromaPedido = !!diagnosticoPedido
    && (diagnosticoPedido.conectado >= 0.006 || diagnosticoPedido.nucleo >= 0.012);

  if (esFondo) {
    // El fondo final no se puede volver transparente: quedaría un agujero
    // negro. Si el modelo copió el magenta del mapa, se rechaza para reintentar
    // la generación en lugar de enseñar una escena rosa rota.
    return {
      url: cv.toDataURL("image/png"), via: "opaca", vacio,
      ...(hayCromaPedido
        ? { problema: "croma-en-fondo" as const, residuoCroma: Math.max(
            diagnosticoPedido!.conectado, diagnosticoPedido!.nucleo,
          ) }
        : {}),
    };
  }

  // Ya viene con transparencia de verdad: no se toca. Se pide un mínimo del 2%
  // para no confundir cuatro píxeles sueltos con un fondo recortado. Importante:
  // transparencia parcial NO basta si todavía queda una plancha de magenta.
  if (vacio > 0.02 && !hayCromaPedido) {
    return { url: cv.toDataURL("image/png"), via: "transparente", vacio };
  }

  let base = colorDelFondo(d, cv.width, cv.height);

  // El borde no convenció (dibujo en las esquinas), pero el modelo SÍ pintó el
  // magenta que se le pidió: se quita igual. Sin esto la capa delantera se
  // quedaba rosa y tapaba al resto.
  if (!base) {
    const respaldo = pedido ?? parseHex(CROMA);
    if (respaldo && (hayCromaPedido || fraccionCroma(d, cv.width, cv.height, respaldo, 96) >= 0.015)) {
      base = respaldo;
    }
  }

  if (!base) return { url: cv.toDataURL("image/png"), via: "opaca", vacio };

  const r = quitarColor(cv, base);
  return {
    url: cv.toDataURL("image/png"), via: "croma", vacio: r.vacio, color: r.color,
    residuoCroma: r.residuo,
    ...(r.residuo > 0.006 ? { problema: "croma-residual" as const } : {}),
  };
}
