// Partir una capa por sus trozos SUELTOS.
//
// EL PROBLEMA. Una capa generada por la IA trae dentro cosas que no se tocan
// entre sí: los farolillos del muro derecho, el arce de la izquierda y el de la
// derecha viven en el mismo PNG. Mientras sean un solo PNG no hay forma de
// mover uno sin mover los otros, ni de girar uno solo, ni de mandar uno detrás
// del muro. Se puede cambiar la profundidad de la capa entera y poco más.
//
// LO QUE HACE ESTO. Mira la transparencia y agrupa los píxeles que sí se tocan.
// Cada grupo suelto sale como su propia capa, con su centro apuntado para que
// gire por donde debe. A partir de ahí valen los mandos de siempre: orden,
// profundidad, candado, colocación a mano.
//
// DOS DETALLES QUE PARECEN MENUDENCIAS Y NO LO SON:
//
//   · LA HOLGURA. Una copa de arce dibujada hoja a hoja son cientos de manchas
//     que casi se rozan. Sin holgura saldrían cuatrocientas capas de una hoja.
//     Se engorda la silueta unos píxeles ANTES de agrupar, así que lo que está
//     casi pegado cuenta como pegado; los píxeles que se reparten siguen siendo
//     los originales, no los engordados.
//
//   · EL RESTO. Lo que queda por debajo del mínimo no se tira: se junta en una
//     última capa. Perder píxeles al separar sería cambiar la imagen a espaldas
//     de quien solo quería reordenarla.

export interface OpcionesPiezas {
  /** Alfa a partir del cual se considera que hay pintura. */
  umbral?: number;
  /** Píxeles de holgura para unir lo que casi se toca. */
  union?: number;
  /** Cuántas piezas sueltas como mucho. Lo demás va al resto. */
  maximo?: number;
  /** Área mínima de una pieza, en fracción del lienzo. */
  minimo?: number;
}

export const OPCIONES_PIEZAS: Required<OpcionesPiezas> = {
  umbral: 24,
  union: 3,
  maximo: 12,
  minimo: 0.0015,
};

export interface PiezaDetectada {
  /** El valor que lleva esta pieza dentro de `etiquetas` (1..n). */
  etiqueta: number;
  pixeles: number;
  /** Caja que la encierra, en píxeles de la imagen. Los dos extremos entran. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** El cajón de sastre: los trozos pequeños que no daban para capa propia. */
  resto: boolean;
}

export interface MapaPiezas {
  ancho: number;
  alto: number;
  /** 0 = nada; 1..n = a qué pieza va cada píxel. */
  etiquetas: Int32Array;
  piezas: PiezaDetectada[];
  /** Grupos encontrados antes de juntar los pequeños. */
  encontradas: number;
}

/** Silueta engordada `r` píxeles, en dos pasadas separables. */
function engordar(mascara: Uint8Array, ancho: number, alto: number, r: number): Uint8Array {
  if (r <= 0) return mascara;
  const paso1 = new Uint8Array(mascara.length);
  for (let y = 0; y < alto; y++) {
    const fila = y * ancho;
    for (let x = 0; x < ancho; x++) {
      let v = 0;
      const desde = Math.max(0, x - r);
      const hasta = Math.min(ancho - 1, x + r);
      for (let k = desde; k <= hasta; k++) {
        if (mascara[fila + k]) { v = 1; break; }
      }
      paso1[fila + x] = v;
    }
  }
  const paso2 = new Uint8Array(mascara.length);
  for (let x = 0; x < ancho; x++) {
    for (let y = 0; y < alto; y++) {
      let v = 0;
      const desde = Math.max(0, y - r);
      const hasta = Math.min(alto - 1, y + r);
      for (let k = desde; k <= hasta; k++) {
        if (paso1[k * ancho + x]) { v = 1; break; }
      }
      paso2[y * ancho + x] = v;
    }
  }
  return paso2;
}

/**
 * Agrupa los píxeles opacos que se tocan y devuelve una etiqueta por píxel.
 *
 * `alfa` es un byte por píxel, en el orden de siempre (fila a fila).
 */
export function etiquetarPiezas(
  alfa: Uint8Array | Uint8ClampedArray,
  ancho: number,
  alto: number,
  opciones: OpcionesPiezas = {},
): MapaPiezas {
  const o = { ...OPCIONES_PIEZAS, ...opciones };
  const n = ancho * alto;
  const vacio: MapaPiezas = {
    ancho, alto, etiquetas: new Int32Array(0), piezas: [], encontradas: 0,
  };
  if (n <= 0 || alfa.length < n) return vacio;

  const mascara = new Uint8Array(n);
  let opacos = 0;
  for (let i = 0; i < n; i++) {
    if (alfa[i] > o.umbral) { mascara[i] = 1; opacos++; }
  }
  if (!opacos) return { ...vacio, etiquetas: new Int32Array(n) };

  const ancha = engordar(mascara, ancho, alto, Math.max(0, Math.round(o.union)));

  // Inundación con pila propia: la recursiva se lleva por delante la pila de
  // JavaScript en cuanto una mancha ocupa medio lienzo.
  const crudas = new Int32Array(n);
  const pila = new Int32Array(n);
  let ultima = 0;
  for (let semilla = 0; semilla < n; semilla++) {
    if (!ancha[semilla] || crudas[semilla]) continue;
    ultima++;
    let cima = 0;
    pila[cima++] = semilla;
    crudas[semilla] = ultima;
    while (cima > 0) {
      const p = pila[--cima];
      const x = p % ancho;
      const y = (p - x) / ancho;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= alto) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= ancho) continue;
          const q = ny * ancho + nx;
          if (!ancha[q] || crudas[q]) continue;
          crudas[q] = ultima;
          pila[cima++] = q;
        }
      }
    }
  }

  // Las cuentas se hacen sobre los píxeles DE VERDAD, no sobre los engordados:
  // si no, el área de una pieza dependería de la holgura elegida.
  type Cuenta = { etiqueta: number; pixeles: number; x0: number; y0: number; x1: number; y1: number };
  const cuentas = new Map<number, Cuenta>();
  for (let i = 0; i < n; i++) {
    if (!mascara[i]) continue;
    const e = crudas[i];
    if (!e) continue;
    const x = i % ancho;
    const y = (i - x) / ancho;
    const c = cuentas.get(e);
    if (!c) {
      cuentas.set(e, { etiqueta: e, pixeles: 1, x0: x, y0: y, x1: x, y1: y });
      continue;
    }
    c.pixeles++;
    if (x < c.x0) c.x0 = x;
    if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y;
    if (y > c.y1) c.y1 = y;
  }

  const orden = [...cuentas.values()].sort((a, b) => b.pixeles - a.pixeles);
  const areaMin = Math.max(24, Math.round(o.minimo * n));
  const grandes = orden.filter((c) => c.pixeles >= areaMin).slice(0, Math.max(1, o.maximo));
  const sueltas = new Set(grandes.map((c) => c.etiqueta));
  const restos = orden.filter((c) => !sueltas.has(c.etiqueta));

  // Renumerar: las grandes por tamaño y, al final, el cajón de sastre.
  const traduccion = new Int32Array(ultima + 1);
  const piezas: PiezaDetectada[] = grandes.map((c, i) => {
    traduccion[c.etiqueta] = i + 1;
    return { etiqueta: i + 1, pixeles: c.pixeles, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, resto: false };
  });
  if (restos.length) {
    const etiqueta = piezas.length + 1;
    const junta: PiezaDetectada = {
      etiqueta,
      pixeles: 0,
      x0: ancho - 1, y0: alto - 1, x1: 0, y1: 0,
      resto: true,
    };
    for (const c of restos) {
      traduccion[c.etiqueta] = etiqueta;
      junta.pixeles += c.pixeles;
      junta.x0 = Math.min(junta.x0, c.x0);
      junta.y0 = Math.min(junta.y0, c.y0);
      junta.x1 = Math.max(junta.x1, c.x1);
      junta.y1 = Math.max(junta.y1, c.y1);
    }
    piezas.push(junta);
  }

  const etiquetas = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (mascara[i]) etiquetas[i] = traduccion[crudas[i]];
  }

  return { ancho, alto, etiquetas, piezas, encontradas: cuentas.size };
}

/** El centro de la caja de una pieza, en 0..1 de la imagen. */
export function pivoteDePieza(p: PiezaDetectada, ancho: number, alto: number) {
  return {
    pivoteX: ancho > 0 ? (p.x0 + p.x1 + 1) / 2 / ancho : 0.5,
    pivoteY: alto > 0 ? (p.y0 + p.y1 + 1) / 2 / alto : 0.5,
  };
}

/** Cómo llamar a cada trozo en la lista de capas. */
export function nombreDePieza(base: string, p: PiezaDetectada, indice: number) {
  const limpio = base.replace(/\s*·\s*(pieza|resto).*$/i, "").trim() || "Capa";
  return p.resto ? `${limpio} · resto` : `${limpio} · pieza ${indice + 1}`;
}

/** Un rectángulo dibujado sobre la capa, en 0..1 de la imagen. */
export interface ZonaRecorte {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function zonaNormalizada(z: ZonaRecorte): ZonaRecorte {
  return {
    x0: Math.max(0, Math.min(1, Math.min(z.x0, z.x1))),
    y0: Math.max(0, Math.min(1, Math.min(z.y0, z.y1))),
    x1: Math.max(0, Math.min(1, Math.max(z.x0, z.x1))),
    y1: Math.max(0, Math.min(1, Math.max(z.y0, z.y1))),
  };
}

/**
 * Qué piezas caen dentro del rectángulo y si hay que cortar a tijera.
 *
 * PRIMERO SE INTENTA POR PIEZAS. Encerrar un farolillo en un cuadro y llevarse
 * el farolillo entero —con su silueta, no con un recorte cuadrado— es lo que
 * uno quiere el 90% de las veces, y es lo que sale si esa pieza está suelta.
 *
 * A TIJERA es el plan B, para cuando el decorado viene de una pieza: en la capa
 * de la calzada, el muro y la valla se tocan, así que no hay nada «suelto» que
 * llevarse y la única forma de separarlos es cortar por donde diga el usuario.
 */
export function repartirPorZona(mapa: MapaPiezas, zona: ZonaRecorte): {
  dentro: Set<number>;
  aTijera: boolean;
  /** Píxeles pintados que caen dentro del rectángulo. */
  pixelesDentro: number;
} {
  const z = zonaNormalizada(zona);
  const { ancho, alto, etiquetas } = mapa;
  const x0 = Math.floor(z.x0 * ancho), x1 = Math.ceil(z.x1 * ancho);
  const y0 = Math.floor(z.y0 * alto), y1 = Math.ceil(z.y1 * alto);
  const enZona = new Map<number, number>();
  let pixelesDentro = 0;
  for (let y = y0; y < y1; y++) {
    if (y < 0 || y >= alto) continue;
    const fila = y * ancho;
    for (let x = x0; x < x1; x++) {
      if (x < 0 || x >= ancho) continue;
      const e = etiquetas[fila + x];
      if (!e) continue;
      enZona.set(e, (enZona.get(e) ?? 0) + 1);
      pixelesDentro++;
    }
  }
  const dentro = new Set<number>();
  for (const p of mapa.piezas) {
    const n = enZona.get(p.etiqueta) ?? 0;
    if (p.pixeles > 0 && n / p.pixeles >= 0.6) dentro.add(p.etiqueta);
  }
  return { dentro, aTijera: dentro.size === 0 && pixelesDentro > 0, pixelesDentro };
}

export interface PiezaImagen {
  nombre: string;
  /** PNG del tamaño del lienzo con SOLO esta pieza. Blob URL. */
  url: string;
  pivoteX: number;
  pivoteY: number;
  /** Fracción transparente, como la que apunta el recorte de croma. */
  vacio: number;
  pixeles: number;
  resto: boolean;
}

type Fuente = HTMLImageElement | HTMLCanvasElement;

function tamanoDe(img: Fuente) {
  return img instanceof HTMLCanvasElement
    ? { w: img.width, h: img.height }
    : { w: img.naturalWidth, h: img.naturalHeight };
}

/**
 * Cuenta cuántos trozos sueltos tiene la imagen, sin generarlos.
 *
 * Sirve para poder decir «hay 5» ANTES de rehacer el montaje: separar cambia
 * la lista de capas entera y no es algo que uno quiera descubrir a posteriori.
 */
export function contarPiezas(img: Fuente, opciones: OpcionesPiezas = {}): MapaPiezas {
  const { w, h } = tamanoDe(img);
  if (!w || !h) return { ancho: 0, alto: 0, etiquetas: new Int32Array(0), piezas: [], encontradas: 0 };
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true });
  if (!c) throw new Error("Este navegador no deja leer los píxeles de la capa.");
  c.drawImage(img, 0, 0, w, h);
  const datos = c.getImageData(0, 0, w, h).data;
  const alfa = new Uint8Array(w * h);
  for (let i = 0, p = 3; i < alfa.length; i++, p += 4) alfa[i] = datos[p];
  return etiquetarPiezas(alfa, w, h, opciones);
}

/**
 * Parte la imagen en un PNG por pieza, todos del tamaño del original.
 *
 * DEL TAMAÑO DEL ORIGINAL a propósito, aunque la pieza ocupe una esquina: el
 * dibujante estira cada capa hasta llenar el plano, así que un recorte ajustado
 * saldría deformado a pantalla completa. Con el lienzo entero cada pieza cae
 * exactamente donde estaba y el PNG comprime el vacío casi a nada.
 */
export async function partirEnPiezas(
  img: Fuente,
  nombreBase: string,
  opciones: OpcionesPiezas = {},
): Promise<{ piezas: PiezaImagen[]; mapa: MapaPiezas }> {
  const mapa = contarPiezas(img, opciones);
  const { ancho, alto, piezas } = mapa;
  if (piezas.length < 2) return { piezas: [], mapa };

  const origen = document.createElement("canvas");
  origen.width = ancho;
  origen.height = alto;
  const co = origen.getContext("2d", { willReadFrequently: true });
  if (!co) throw new Error("Este navegador no deja leer los píxeles de la capa.");
  co.drawImage(img, 0, 0, ancho, alto);
  const datos = co.getImageData(0, 0, ancho, alto);

  const salida = document.createElement("canvas");
  salida.width = ancho;
  salida.height = alto;
  const cs = salida.getContext("2d");
  if (!cs) throw new Error("Este navegador no deja componer la pieza.");

  const fuera: PiezaImagen[] = [];
  for (let i = 0; i < piezas.length; i++) {
    const p = piezas[i];
    const trozo = await sacarTrozo(
      datos, ancho, alto, cs, salida,
      (k) => mapa.etiquetas[k] === p.etiqueta,
    );
    if (!trozo) continue;
    fuera.push({
      nombre: nombreDePieza(nombreBase, p, i),
      url: trozo.url,
      ...pivoteDePieza(p, ancho, alto),
      vacio: 1 - p.pixeles / Math.max(1, ancho * alto),
      pixeles: p.pixeles,
      resto: p.resto,
    });
  }
  return { piezas: fuera, mapa };
}

/** Un PNG del tamaño del lienzo con los píxeles que pasen el filtro. */
async function sacarTrozo(
  datos: ImageData,
  ancho: number,
  alto: number,
  cs: CanvasRenderingContext2D,
  salida: HTMLCanvasElement,
  filtro: (indice: number, x: number, y: number) => boolean,
): Promise<{ url: string; pixeles: number; caja: PiezaDetectada } | null> {
  const trozo = new ImageData(ancho, alto);
  let pixeles = 0;
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const k = y * ancho + x;
      if (!filtro(k, x, y)) continue;
      const q = k * 4;
      if (datos.data[q + 3] === 0) continue;
      trozo.data[q] = datos.data[q];
      trozo.data[q + 1] = datos.data[q + 1];
      trozo.data[q + 2] = datos.data[q + 2];
      trozo.data[q + 3] = datos.data[q + 3];
      pixeles++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!pixeles) return null;
  cs.clearRect(0, 0, ancho, alto);
  cs.putImageData(trozo, 0, 0);
  const blob = await new Promise<Blob | null>((r) => salida.toBlob(r, "image/png"));
  if (!blob) throw new Error("No se pudo guardar el recorte.");
  return {
    url: URL.createObjectURL(blob),
    pixeles,
    caja: { etiqueta: 1, pixeles, x0, y0, x1, y1, resto: false },
  };
}

export interface RecorteZona {
  /** Lo que se lleva el recorte, ya como capa aparte. */
  dentro: PiezaImagen;
  /** Lo que queda de la capa. `null` si el recorte se la llevó entera. */
  fuera: PiezaImagen | null;
  /** Por siluetas sueltas o cortando por el rectángulo. */
  modo: "piezas" | "tijera";
}

/**
 * Saca de la capa lo que haya dentro de un rectángulo.
 *
 * Devuelve `null` cuando ahí no hay nada pintado: es la respuesta honesta a un
 * recuadro sobre el vacío, mejor que crear una capa transparente y dejar que el
 * usuario se pregunte dónde está.
 */
export async function extraerZona(
  img: Fuente,
  nombreBase: string,
  zona: ZonaRecorte,
  opciones: OpcionesPiezas = {},
): Promise<RecorteZona | null> {
  const mapa = contarPiezas(img, opciones);
  const { ancho, alto } = mapa;
  if (!ancho || !alto) return null;
  const reparto = repartirPorZona(mapa, zona);
  if (!reparto.pixelesDentro) return null;

  const z = zonaNormalizada(zona);
  const cx0 = Math.floor(z.x0 * ancho), cx1 = Math.ceil(z.x1 * ancho);
  const cy0 = Math.floor(z.y0 * alto), cy1 = Math.ceil(z.y1 * alto);
  const modo: RecorteZona["modo"] = reparto.aTijera ? "tijera" : "piezas";
  const seLleva = reparto.aTijera
    ? (_k: number, x: number, y: number) => x >= cx0 && x < cx1 && y >= cy0 && y < cy1
    : (k: number) => reparto.dentro.has(mapa.etiquetas[k]);

  const origen = document.createElement("canvas");
  origen.width = ancho;
  origen.height = alto;
  const co = origen.getContext("2d", { willReadFrequently: true });
  if (!co) throw new Error("Este navegador no deja leer los píxeles de la capa.");
  co.drawImage(img, 0, 0, ancho, alto);
  const datos = co.getImageData(0, 0, ancho, alto);

  const salida = document.createElement("canvas");
  salida.width = ancho;
  salida.height = alto;
  const cs = salida.getContext("2d");
  if (!cs) throw new Error("Este navegador no deja componer el recorte.");

  const dentro = await sacarTrozo(datos, ancho, alto, cs, salida, seLleva);
  if (!dentro) return null;
  const fuera = await sacarTrozo(datos, ancho, alto, cs, salida, (k, x, y) => !seLleva(k, x, y));

  const base = nombreBase.replace(/\s*·\s*(pieza|resto|zona).*$/i, "").trim() || "Capa";
  const total = Math.max(1, ancho * alto);
  return {
    modo,
    dentro: {
      nombre: `${base} · zona`,
      url: dentro.url,
      ...pivoteDePieza(dentro.caja, ancho, alto),
      vacio: 1 - dentro.pixeles / total,
      pixeles: dentro.pixeles,
      resto: false,
    },
    fuera: fuera
      ? {
        nombre: nombreBase,
        url: fuera.url,
        ...pivoteDePieza(fuera.caja, ancho, alto),
        vacio: 1 - fuera.pixeles / total,
        pixeles: fuera.pixeles,
        resto: false,
      }
      : null,
  };
}
