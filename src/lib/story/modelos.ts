// Qué modelo va en cada tarea.
//
// Pedirle al usuario que escriba «gpt-audio-1.5» a mano era absurdo: nadie se
// sabe esos nombres, y equivocarse en una letra da un error de OpenAI que no
// explica nada. Aquí se clasifican los modelos por lo que saben hacer para
// poder enseñarlos en una lista.
//
// La lista buena es la de la cuenta del usuario (GET /v1/models): esos son los
// que su clave puede usar de verdad. La de abajo es solo el paracaídas para
// cuando aún no hay clave o la consulta falla, y envejecerá — OpenAI saca
// modelos constantemente. Por eso se puede escribir uno a mano igual que antes.

export type Tarea = "texto" | "imagen" | "voz";

// Sacados de la documentación de OpenAI. Si tu cuenta tiene otros, la lista de
// verdad los traerá; estos solo evitan una lista vacía.
export const CONOCIDOS: Record<Tarea, string[]> = {
  texto: ["gpt-5.6-luna", "gpt-5.6", "gpt-5-mini", "gpt-5-nano", "gpt-4.1-mini", "gpt-4o-mini"],
  voz: ["gpt-audio-1.5", "gpt-realtime-2.1"],
  imagen: ["gpt-image-2", "gpt-image-1"],
};

// Las voces no dependen de la cuenta: las fija OpenAI. Si alguna deja de valer,
// el error de OpenAI lo dirá y se puede escribir otra a mano.
export const VOCES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "ash", "ballad", "coral", "sage", "verse"];

// Modelos que existen pero NO sirven para nada de lo que hace esta sección:
// transcriben, miden parecidos, moderan o escriben código. Fuera de la lista.
// «preview» va aquí porque son modelos de prueba que OpenAI retira sin avisar:
// justo los que dejan tirado a medio capítulo.
const DESCARTAR = /embedding|whisper|moderation|transcribe|codex|search|computer-use|davinci|babbage|deep-research|preview/;

// Una foto fechada («gpt-audio-mini-2025-10-06») es una versión congelada: son
// las PRIMERAS que retiran. El nombre sin fecha apunta siempre a la versión
// viva, así que se prefiere ese aunque los dos estén en la lista.
export function esFechado(id: string): boolean {
  return /-\d{4}-\d{2}-\d{2}$|-\d{4}$/.test(id);
}

export function clasificar(id: string): Tarea | null {
  const s = id.toLowerCase();
  if (DESCARTAR.test(s)) return null;
  // El orden importa: «gpt-audio» también empieza por «gpt».
  if (/image|dall-e/.test(s)) return "imagen";
  if (/audio|realtime|\btts\b|^tts/.test(s)) return "voz";
  if (/^(gpt|chatgpt|o[1-9])/.test(s)) return "texto";
  return null;
}

// Para ordenar: lo más nuevo primero, y a igualdad, lo barato antes que lo caro.
// No se inventa ningún precio: «mini» y «nano» son de la propia nomenclatura de
// OpenAI para sus versiones reducidas.
function version(id: string): number {
  const m = id.match(/(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) * 100 + Number(m[2] ?? 0) : 0;
}

// La primera opción de cada lista es la que queda preseleccionada, así que el
// orden no es cosmético. Se aparta lo viejo (dall-e, tts-1) y lo que existe
// pero no encaja en narrar un capítulo (realtime es para hablar en directo).
function rango(id: string, fallidos: string[] = []): number {
  // Lo que ya falló, al final del todo: es el único dato REAL de que algo no
  // sirve. La lista de OpenAI no dice cuáles están retirados.
  if (fallidos.includes(id)) return 4;
  if (/dall-e|^tts-/.test(id)) return 3;
  if (esFechado(id)) return 2;
  if (/realtime/.test(id)) return 1;
  return 0;
}

export function ordenar(ids: string[], fallidos: string[] = []): string[] {
  return [...ids].sort((a, b) => {
    const ra = rango(a, fallidos), rb = rango(b, fallidos);
    if (ra !== rb) return ra - rb;
    const va = version(a), vb = version(b);
    if (va !== vb) return vb - va;
    const ba = /mini|nano/.test(a) ? 0 : 1, bb = /mini|nano/.test(b) ? 0 : 1;
    if (ba !== bb) return ba - bb;
    return a.localeCompare(b);
  });
}

// Una nota corta al lado de cada opción, para que se entienda sin salir de la
// página. Solo dice lo que se sabe del nombre; no promete precios.
export function nota(id: string, fallidos: string[] = []): string {
  if (fallidos.includes(id)) return "te falló la última vez";
  // El aviso de que se retira va ANTES que el de que es barato: de las dos
  // cosas, la que te deja tirado a medio capítulo es esta.
  if (esFechado(id)) return "versión congelada: se retira antes";
  if (/nano/.test(id)) return "el más pequeño y barato";
  if (/mini/.test(id)) return "reducido: más barato";
  if (/realtime/.test(id)) return "pensado para conversación en directo";
  return "";
}

// Agrupa una lista cruda de identificadores en las tres tareas.
export function repartir(ids: string[], fallidos: string[] = []): Record<Tarea, string[]> {
  const fuera: Record<Tarea, string[]> = { texto: [], imagen: [], voz: [] };
  for (const id of ids) {
    const t = clasificar(id);
    if (t) fuera[t].push(id);
  }
  return {
    texto: ordenar(fuera.texto, fallidos),
    imagen: ordenar(fuera.imagen, fallidos),
    voz: ordenar(fuera.voz, fallidos),
  };
}
