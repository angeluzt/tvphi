import { env } from "@/lib/env";

// Cuánto se ha gastado en OpenAI, leído de su propia API.
//
// DOS AVISOS QUE AHORRAN UNA TARDE:
//
// 1. La clave normal (OPENAI_API_KEY) NO sirve aquí. Los costes viven bajo
//    /v1/organization y piden una CLAVE DE ADMINISTRADOR de la organización
//    (sk-admin-…), que se saca aparte en el panel de OpenAI. Con la de siempre
//    responde 401, y el mensaje no explica por qué.
//
// 2. NO existe endpoint oficial para el saldo que queda. Se puede saber lo
//    gastado, no lo disponible. Lo que hay por ahí (dashboard/billing/…) es
//    interno, no está documentado y rompe sin avisar, así que no se usa: mejor
//    decir que no se sabe que enseñar un número que un día miente. Para suplirlo
//    se puede fijar un presupuesto propio y restar.

export const SIN_CLAVE_ADMIN =
  "Falta OPENAI_ADMIN_KEY. Los costes necesitan una clave de administrador de la "
  + "organización (sk-admin-…), distinta de la que genera las historias.";

/** Clave de administrador. Solo servidor, nunca viaja al navegador. */
export function claveAdminOpenAi(): string | null {
  return (process.env["OPENAI_ADMIN_KEY"] ?? "").trim() || null;
}

/**
 * Presupuesto mensual propio, en dólares. Opcional.
 *
 * Como OpenAI no dice cuánto queda, esto es lo que permite contestar «te queda
 * X»: se pone a mano lo que uno decide gastarse al mes y se resta lo gastado.
 */
export function presupuestoMensual(): number | null {
  const v = Number((process.env["OPENAI_PRESUPUESTO_MENSUAL"] ?? "").trim());
  return Number.isFinite(v) && v > 0 ? v : null;
}

const BASE = () =>
  `${(process.env["OPENAI_BASE_URL"] || "https://api.openai.com").replace(/\/+$/, "")}`;

export interface DiaGasto {
  /** AAAA-MM-DD en UTC, que es como agrupa OpenAI. */
  dia: string;
  usd: number;
}

export interface ConceptoGasto {
  /** Lo que OpenAI llama «line_item»: el modelo o servicio concreto. */
  concepto: string;
  usd: number;
}

export interface Gasto {
  desde: string;
  hasta: string;
  /** El huso con el que se han contado los días. Siempre UTC: ver `diaUtc`. */
  huso: string;
  totalUsd: number;
  hoyUsd: number;
  mesUsd: number;
  moneda: string;
  porDia: DiaGasto[];
  porConcepto: ConceptoGasto[];
  presupuestoUsd: number | null;
  quedaUsd: number | null;
  /** Verdad incómoda que la interfaz debe enseñar, no esconder. */
  nota: string;
}

type Cubo = {
  start_time: number;
  results?: { amount?: { value?: number; currency?: string }; line_item?: string | null }[];
};

/**
 * Pide los costes agrupados por concepto, día a día.
 *
 * Se pagina hasta agotar, con tope: si un día OpenAI devuelve más páginas de
 * las esperadas, es preferible un número incompleto y avisado que un servidor
 * dando vueltas.
 */
/**
 * El día, en UTC, que es como agrupa OpenAI.
 *
 * Hubo un intento de contarlos en el huso de quien mira —para que a alguien en
 * México no le saliera «Hoy: $0» toda la tarde— pidiendo cubos de una hora y
 * repartiéndolos. No se puede: `/v1/organization/costs` solo acepta
 * `bucket_width=1d`. Con `1h` la petición se va al garete, y como además se
 * pedía `limit=168` la paginación daba las 40 vueltas del tope, tardaba lo
 * suyo y el panel acababa recibiendo la página de error del servidor en vez de
 * JSON («Unexpected token '<'»).
 *
 * Así que el dato viene por días UTC y no hay forma de afinarlo desde esta
 * API. Lo que sí se puede es no mentir: la interfaz dice «(UTC)» al lado.
 */
const DIA_UTC = "UTC";

/** AAAA-MM-DD de un instante, en UTC. */
function diaUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function leerGasto(dias = 30): Promise<Gasto | { error: string }> {
  const key = claveAdminOpenAi();
  if (!key) return { error: SIN_CLAVE_ADMIN };

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - dias * 86_400_000);
  const inicio = Math.floor(desde.getTime() / 1000);

  const cubos: Cubo[] = [];
  let pagina: string | null = null;
  for (let vuelta = 0; vuelta < 12; vuelta++) {
    const u = new URL(`${BASE()}/v1/organization/costs`);
    u.searchParams.set("start_time", String(inicio));
    // `1d` es el ÚNICO valor que acepta este endpoint, y 31 el tope de `limit`.
    // No es una preferencia: con cualquier otra cosa la llamada no sirve.
    u.searchParams.set("bucket_width", "1d");
    u.searchParams.set("limit", "31");
    u.searchParams.append("group_by", "line_item");
    if (pagina) u.searchParams.set("page", pagina);

    let r: Response;
    try {
      // Con límite de tiempo: si OpenAI se queda pensando, es mejor un error
      // dicho a tiempo que un panel colgado hasta que el servidor corte por su
      // cuenta y devuelva una página de error que aquí no se puede leer.
      r = await fetch(u, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      const msg = e?.name === "TimeoutError" || e?.name === "AbortError"
        ? "OpenAI tardó demasiado en responder a los costes."
        : "No se pudo hablar con OpenAI: " + (e?.message ?? "");
      return { error: msg };
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      let msg = "";
      try { msg = JSON.parse(txt)?.error?.message ?? ""; } catch { msg = ""; }
      if (r.status === 401) {
        return { error: "OpenAI rechazó la clave de administrador (401). "
          + "Comprueba que es una sk-admin-… de la organización, no la de las historias." };
      }
      if (r.status === 404) {
        return { error: "OpenAI devolvió 404 en el endpoint de costes. Suele pasar cuando la "
          + "clave no es de administrador o la organización no tiene la API de uso habilitada." };
      }
      return { error: msg || `OpenAI respondió ${r.status} al pedir los costes.` };
    }
    const j: any = await r.json().catch(() => null);
    if (!j) return { error: "OpenAI respondió algo que no es JSON al pedir los costes." };
    cubos.push(...(Array.isArray(j.data) ? j.data : []));
    if (!j.has_more || !j.next_page) break;
    pagina = String(j.next_page);
  }

  // ── Sumas ─────────────────────────────────────────────────────────────────
  const porDiaMap = new Map<string, number>();
  const porConceptoMap = new Map<string, number>();
  let moneda = "usd";
  let total = 0;

  for (const c of cubos) {
    const dia = diaUtc(c.start_time * 1000);
    for (const res of c.results ?? []) {
      const v = Number(res?.amount?.value ?? 0);
      if (!Number.isFinite(v) || v === 0) continue;
      moneda = res?.amount?.currency || moneda;
      total += v;
      porDiaMap.set(dia, (porDiaMap.get(dia) ?? 0) + v);
      const cual = (res.line_item ?? "").trim() || "sin desglosar";
      porConceptoMap.set(cual, (porConceptoMap.get(cual) ?? 0) + v);
    }
  }

  const hoy = diaUtc(Date.now());
  const mes = hoy.slice(0, 7);
  let hoyUsd = 0, mesUsd = 0;
  for (const [dia, v] of porDiaMap) {
    if (dia === hoy) hoyUsd += v;
    if (dia.startsWith(mes)) mesUsd += v;
  }

  const presupuesto = presupuestoMensual();
  return {
    desde: diaUtc(desde.getTime()),
    hasta: hoy,
    huso: DIA_UTC,
    totalUsd: redondea(total),
    hoyUsd: redondea(hoyUsd),
    mesUsd: redondea(mesUsd),
    moneda,
    porDia: [...porDiaMap.entries()]
      .map(([dia, usd]) => ({ dia, usd: redondea(usd) }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    porConcepto: [...porConceptoMap.entries()]
      .map(([concepto, usd]) => ({ concepto, usd: redondea(usd) }))
      .sort((a, b) => b.usd - a.usd),
    presupuestoUsd: presupuesto,
    quedaUsd: presupuesto === null ? null : redondea(presupuesto - mesUsd),
    nota: (presupuesto === null
      ? "OpenAI no publica el saldo restante: solo lo gastado. Para ver «cuánto queda», "
        + "pon OPENAI_PRESUPUESTO_MENSUAL con lo que decidas gastarte al mes. "
      : "Lo que queda es respecto a TU presupuesto, no al saldo real de OpenAI: "
        + "esa cifra no la publica su API. ")
      + "Los días van en UTC porque es como los agrupa OpenAI; su API no da el "
      + "detalle por horas, así que «hoy» empieza a las 18:00 del día anterior "
      + "en el centro de México.",
  };
}

const redondea = (n: number) => Math.round(n * 1e6) / 1e6;
