import { prisma } from "@/lib/prisma";

// Los mandos del gasto, en un solo sitio.
//
// La idea: por defecto todo BARATO para el usuario normal, y el admin decide
// desde /admin qué se enciende. Lo que se elige aquí lo aplica el SERVIDOR; el
// navegador no puede pedir calidad alta por su cuenta aunque toque la petición,
// que es lo único que hace que un límite sea un límite.

export type CalidadImagen = "low" | "medium" | "high";

export interface AjustesIa {
  /** Calidad con la que se generan las imágenes del usuario normal. */
  calidadImagen: CalidadImagen;
  /** Imágenes con IA por usuario y 24 h. */
  imagenesPorDia: number;
  /** Capítulos escritos con IA por usuario y 24 h. */
  historiasPorDia: number;
  /** Si no, la narración la pone el modelo del navegador (gratis). */
  vozDePago: boolean;
  /** Apagarlo deja al usuario normal sin generar imágenes. */
  imagenesIa: boolean;
}

/**
 * Lo barato. Es lo que se aplica mientras nadie toque nada, a propósito: si un
 * ajuste se pierde o la tabla aún no existe, el fallo debe salir por el lado
 * que no cuesta dinero.
 */
export const AJUSTES_DEFECTO: AjustesIa = {
  calidadImagen: "low",
  imagenesPorDia: 3,
  historiasPorDia: 3,
  vozDePago: false,
  imagenesIa: true,
};

/** Lo que cuesta cada calidad, para poder enseñarlo al elegir. */
export const PRECIO_IMAGEN: Record<CalidadImagen, number> = {
  low: 0.005,
  medium: 0.041,
  high: 0.165,
};

export const CALIDADES: { id: CalidadImagen; label: string; pista: string }[] = [
  { id: "low", label: "Baja", pista: "$0.005 · se nota al hacer zoom" },
  { id: "medium", label: "Media", pista: "$0.041 · 8× más cara" },
  { id: "high", label: "Alta", pista: "$0.165 · 33× más cara" },
];

const CLAVES = {
  calidadImagen: "ia_calidad_imagen",
  imagenesPorDia: "ia_imagenes_por_dia",
  historiasPorDia: "story_daily_limit",   // el que ya existía; se respeta el nombre
  vozDePago: "ia_voz_de_pago",
  imagenesIa: "ia_imagenes_activas",
} as const;

const esCalidad = (v: unknown): v is CalidadImagen =>
  v === "low" || v === "medium" || v === "high";

const entero = (v: unknown, min: number, max: number): number | null => {
  // Number("") es 0, no NaN. Sin esta comprobación, un ajuste que aún no
  // existe se leía como cero, y «0 imágenes al día» deja fuera a todo el
  // mundo en vez de caer al valor por defecto.
  const txt = String(v ?? "").trim();
  if (!txt) return null;
  const n = Number(txt);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

/** Los ajustes vigentes. Nunca lanza: si algo falla, devuelve lo barato. */
export async function leerAjustes(): Promise<AjustesIa> {
  try {
    const filas = await prisma.appSetting.findMany({
      where: { key: { in: Object.values(CLAVES) } },
    });
    const m = new Map(filas.map((f) => [f.key, f.value]));
    return {
      calidadImagen: esCalidad(m.get(CLAVES.calidadImagen))
        ? (m.get(CLAVES.calidadImagen) as CalidadImagen)
        : AJUSTES_DEFECTO.calidadImagen,
      imagenesPorDia: entero(m.get(CLAVES.imagenesPorDia), 0, 500) ?? AJUSTES_DEFECTO.imagenesPorDia,
      historiasPorDia: entero(m.get(CLAVES.historiasPorDia), 0, 100) ?? AJUSTES_DEFECTO.historiasPorDia,
      vozDePago: m.get(CLAVES.vozDePago) === "1",
      imagenesIa: m.get(CLAVES.imagenesIa) !== "0",
    };
  } catch {
    // Tabla aún sin migrar, base caída… da igual: lo barato.
    return { ...AJUSTES_DEFECTO };
  }
}

export async function guardarAjustes(a: Partial<AjustesIa>): Promise<AjustesIa> {
  const pares: [string, string][] = [];
  if (a.calidadImagen !== undefined) {
    if (!esCalidad(a.calidadImagen)) throw new Error("Calidad de imagen desconocida.");
    pares.push([CLAVES.calidadImagen, a.calidadImagen]);
  }
  if (a.imagenesPorDia !== undefined) {
    const v = entero(a.imagenesPorDia, 0, 500);
    if (v == null) throw new Error("Las imágenes por día tienen que ser un número.");
    pares.push([CLAVES.imagenesPorDia, String(v)]);
  }
  if (a.historiasPorDia !== undefined) {
    const v = entero(a.historiasPorDia, 0, 100);
    if (v == null) throw new Error("Las historias por día tienen que ser un número.");
    pares.push([CLAVES.historiasPorDia, String(v)]);
  }
  if (a.vozDePago !== undefined) pares.push([CLAVES.vozDePago, a.vozDePago ? "1" : "0"]);
  if (a.imagenesIa !== undefined) pares.push([CLAVES.imagenesIa, a.imagenesIa ? "1" : "0"]);

  for (const [key, value] of pares) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  return leerAjustes();
}

/**
 * La calidad que de verdad se va a usar en una petición.
 *
 * El usuario normal recibe la del panel y no puede pedir otra. El admin sí,
 * porque es quien paga y quien está probando; si no pide ninguna, también le
 * vale la del panel.
 */
export function calidadEfectiva(
  ajustes: AjustesIa,
  esAdmin: boolean,
  pedida?: string | null,
): CalidadImagen {
  if (esAdmin && esCalidad(pedida)) return pedida;
  return ajustes.calidadImagen;
}

/**
 * En calidad baja NO se manda la referencia VFX.
 *
 * El input de una edición se cobra a fidelidad alta pase lo que pase —$2,17 en
 * una factura real, el 20% del gasto en imágenes— así que pagarlo para una
 * imagen de borrador es tirar el dinero justo donde se intentaba ahorrar.
 */
export const usaReferenciaVfx = (calidad: CalidadImagen) => calidad !== "low";
