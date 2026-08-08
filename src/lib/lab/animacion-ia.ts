import {
  MOV_COLA, seCombinan, segundosPosibles, pasoPorDefecto, avanceParaPasar,
  type MovCola, type PasoSecuencia, type FadeAccion,
} from "@/lib/lab/anim-paralaje";
import type { Escena } from "@/lib/lab/escena";

// La animación 2.5D, en una forma que una IA pueda escribir.
//
// EL PROBLEMA. El motor ya sabe animar: `PasoSecuencia` lleva quince campos
// —ox/oy/zoom de arranque, avance, destino absoluto, fades— que la interfaz
// rellena a base de arrastrar la vista previa. Pedirle eso a un modelo es pedir
// que invente coordenadas de cámara a ciegas, y lo que sale son números que no
// significan nada: un `inicioAvance` de 3 en una escena de dos capas, un
// `destZoom` negativo.
//
// LO QUE SE HACE. Un lenguaje corto de intenciones —«acércate 3 segundos»,
// «cruza la puerta», «baja mientras vas a la izquierda»— y AQUÍ se traduce a la
// cola de verdad, poniendo ids, acotando y rechazando lo imposible. El modelo
// dice QUÉ pasa; los números los pone el motor, que es quien los sabe.
//
// Los errores se devuelven en cristiano y con el sitio: quien pega esto viene
// de pedírselo a una IA, y «pasos[2]: «girar» no existe» sirve para arreglar el
// prompt; un error de validación no.

/** Un paso tal y como lo escribe el modelo. */
export interface PasoIa {
  mov: string;
  /** Segundo movimiento a la vez. Tiene que ser de OTRO eje. */
  mov2?: string;
  segundos?: number;
  /** 0–100. Cuánto se mueve: 20 es un apunte, 80 es un viaje. */
  intensidad?: number;
  /** Empezar desde donde quedó el paso anterior (por defecto) o desde el centro. */
  desde?: "continuar" | "centro";
  /** Capa que aparece o desaparece durante el tramo. «frente» = la más cercana. */
  capa?: string;
  fade?: "aparecer" | "desaparecer";
  /** Para qué está este paso. No se usa al animar; se enseña en la cola. */
  nota?: string;
}

export interface AnimacionIa {
  pasos: PasoSecuencia[];
  /** Lo que el modelo dijo de cada paso, en el mismo orden. */
  notas: string[];
  /** Pegas que no impiden animar pero se deben decir. */
  avisos: string[];
}

const MOVS = new Set<MovCola>(MOV_COLA.map((m) => m.id));

const DUR_MIN = 0.4;
const DUR_MAX = 20;
const PASOS_MAX = 12;

const num = (v: unknown, porDefecto: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : porDefecto;
};
const acotar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Traduce la animación del modelo a la cola del motor.
 *
 * No lanza: devuelve lo que se pudo aprovechar y la lista de pegas. Una
 * animación con un paso raro sigue sirviendo sin ese paso; tirar las otras
 * cinco por una palabra mal escrita, no.
 */
export function leerAnimacion(crudo: any, escena?: Escena): AnimacionIa {
  const avisos: string[] = [];
  const fuente = crudo?.animacion?.pasos ?? crudo?.animation?.steps ?? crudo?.animacion ?? null;
  if (!Array.isArray(fuente) || !fuente.length) return { pasos: [], notas: [], avisos };

  // Los ids de capa que existen de verdad, para no dejar un fade apuntando a
  // una capa inventada: el motor no la encontraría y el tramo no haría nada.
  const capas = new Set((escena?.layers ?? []).map((c) => c.id));
  const masCercana = (escena?.layers ?? []).reduce<{ id: string; depth: number } | null>(
    (mejor, c) => (!mejor || (c.depth ?? 0) > mejor.depth ? { id: c.id, depth: c.depth ?? 0 } : mejor),
    null,
  );

  const pasos: PasoSecuencia[] = [];
  const notas: string[] = [];

  fuente.slice(0, PASOS_MAX).forEach((p: any, i: number) => {
    const mov = String(p?.mov ?? "").trim() as MovCola;
    if (!MOVS.has(mov)) {
      avisos.push(`pasos[${i}]: «${p?.mov}» no es un movimiento. Válidos: ${[...MOVS].join(", ")}.`);
      return;
    }
    // «ir-a» pide coordenadas absolutas de cámara, que es justo lo que no se le
    // puede pedir a un modelo. Se traduce a «centrar», que es la intención que
    // suele haber detrás: volver a un sitio conocido.
    if (mov === "ir-a") {
      avisos.push(`pasos[${i}]: «ir-a» necesita coordenadas exactas; se usa «centrar» en su lugar.`);
    }
    const movReal: MovCola = mov === "ir-a" ? "centrar" : mov;

    let mov2: MovCola | undefined;
    const pedido2 = String(p?.mov2 ?? "").trim();
    if (pedido2) {
      if (!MOVS.has(pedido2 as MovCola)) {
        avisos.push(`pasos[${i}]: «${pedido2}» no es un movimiento, se ignora como segundo.`);
      } else if (!seCombinan(movReal, pedido2 as MovCola)) {
        // Dos del mismo eje se anulan: «izq» + «der» no es nada.
        const posibles = segundosPosibles(movReal);
        avisos.push(
          `pasos[${i}]: «${movReal}» y «${pedido2}» son del mismo eje y se anulan. `
          + (posibles.length ? `Con «${movReal}» combinan: ${posibles.join(", ")}.` : "Este no admite segundo."),
        );
      } else {
        mov2 = pedido2 as MovCola;
      }
    }

    const segundos = acotar(num(p?.segundos, 3), DUR_MIN, DUR_MAX);
    const intensidad = acotar(num(p?.intensidad, 55), 0, 100);

    // El fade: a qué capa y qué le pasa.
    let fadeCapa = String(p?.capa ?? "").trim() || "ninguna";
    const fadeAccion = String(p?.fade ?? "").trim();
    let fade: FadeAccion = fadeAccion === "aparecer" || fadeAccion === "desaparecer"
      ? fadeAccion
      : "nada";
    if (fadeCapa !== "ninguna" && fadeCapa !== "frente" && capas.size && !capas.has(fadeCapa)) {
      avisos.push(`pasos[${i}]: no hay ninguna capa «${fadeCapa}»; se usa la de delante.`);
      fadeCapa = "frente";
    }
    if (fade !== "nada" && fadeCapa === "ninguna") fadeCapa = "frente";
    if (fade === "nada" && fadeCapa !== "ninguna") {
      // Nombrar una capa sin decir qué hacer con ella no anima nada.
      fadeCapa = "ninguna";
    }

    // Atravesar sin desvanecer la capa de delante deja al espectador chocando
    // contra ella: es el fallo más común al escribir esto a mano.
    if (movReal === "atravesar" && fade === "nada") {
      fade = "desaparecer";
      fadeCapa = fadeCapa === "ninguna" ? "frente" : fadeCapa;
      avisos.push(`pasos[${i}]: «atravesar» sin desvanecer la capa de delante se ve como un choque; se desvanece.`);
    }

    pasos.push(pasoPorDefecto({
      id: `ia${i + 1}`,
      mov: movReal,
      mov2,
      durMs: Math.round(segundos * 1000),
      distancia: intensidad,
      desde: p?.desde === "centro" ? "centro" : "continuar",
      fadeCapa,
      fade,
    }));
    notas.push(String(p?.nota ?? "").trim().slice(0, 120));
  });

  if (Array.isArray(fuente) && fuente.length > PASOS_MAX) {
    avisos.push(`La animación traía ${fuente.length} pasos; se quedan los primeros ${PASOS_MAX}.`);
  }

  // Si se atraviesa, avisar de si la escena da para ello: con una sola capa no
  // hay nada detrás que revelar y el efecto no se ve.
  if (pasos.some((p) => p.mov === "atravesar" || p.mov2 === "atravesar")) {
    const n = escena?.layers?.length ?? 0;
    if (n && n < 2) avisos.push("Se atraviesa una capa, pero la escena solo tiene una: no hay nada detrás que aparezca.");
    else if (masCercana) {
      const necesario = avanceParaPasar(masCercana.depth);
      if (!Number.isFinite(necesario)) {
        avisos.push(`La capa de delante («${masCercana.id}») tiene depth 0: no se puede atravesar, no se acerca nunca.`);
      }
    }
  }

  return { pasos, notas, avisos };
}

/** ¿La animación mueve la cámara de verdad, o son todo esperas? */
export function animacionVacia(pasos: PasoSecuencia[]): boolean {
  return !pasos.length || pasos.every((p) => p.mov === "esperar" && p.fade === "nada");
}
