// Qué modelo va en cada tarea.
//
// Pedirle al usuario que escriba «gpt-4o-mini-tts» a mano era absurdo: nadie se
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
  // Solo TTS: leen el texto. Chat-audio / realtime son conversación y aquí sobran.
  voz: ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"],
  imagen: ["gpt-image-2", "gpt-image-1"],
};

// Las voces no dependen de la cuenta: las fija OpenAI. Cada una suena distinta,
// y el nombre no dice nada, así que va con su descripción: elegir «onyx» a
// ciegas para un narrador de cuentos es perder una generación.
export const VOCES_INFO: { id: string; que: string }[] = [
  { id: "alloy", que: "Neutra y equilibrada" },
  { id: "ash", que: "Calmada y seria" },
  { id: "ballad", que: "Suave, narrativa" },
  { id: "coral", que: "Enérgica y brillante" },
  { id: "echo", que: "Conversacional y cálida" },
  { id: "fable", que: "Ideal para contar historias" },
  { id: "onyx", que: "Grave, profunda, autoritaria" },
  { id: "nova", que: "Amigable y juvenil" },
  { id: "sage", que: "Sabia y reflexiva" },
  { id: "shimmer", que: "Dulce y delicada" },
  { id: "verse", que: "Expresiva, con ritmo" },
  { id: "marin", que: "Muy natural, de las mejores" },
  { id: "cedar", que: "Natural y profesional, de las mejores" },
];
export const VOCES = VOCES_INFO.map((v) => v.id);
export const comoSuena = (id: string) => VOCES_INFO.find((v) => v.id === id)?.que ?? "";

// Modelos que existen pero NO sirven para nada de lo que hace esta sección:
// transcriben, miden parecidos, moderan o escriben código. Fuera de la lista.
// «preview» va aquí porque son modelos de prueba que OpenAI retira sin avisar:
// justo los que dejan tirado a medio capítulo.
// audio / realtime: pensados para conversar; aquí solo se LEE un guion (TTS).
const DESCARTAR = /embedding|whisper|moderation|transcribe|codex|search|computer-use|davinci|babbage|deep-research|preview|realtime|\baudio\b/;

// Una foto fechada («gpt-4o-mini-tts-2025-12-15») es una versión congelada: son
// las PRIMERAS que retiran. El nombre sin fecha apunta siempre a la versión
// viva, así que se prefiere ese aunque los dos estén en la lista.
export function esFechado(id: string): boolean {
  return /-\d{4}-\d{2}-\d{2}$|-\d{4}$/.test(id);
}

export function clasificar(id: string): Tarea | null {
  const s = id.toLowerCase();
  if (DESCARTAR.test(s)) return null;
  if (/image|dall-e/.test(s)) return "imagen";
  // Solo text-to-speech. Nada de chat con micrófono.
  if (/\btts\b|^tts/.test(s)) return "voz";
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
// orden no es cosmético. Se aparta lo viejo (dall-e) y las fotos fechadas.
// En voz solo hay TTS: leen el texto y no pueden salirse del guion.
export const esDeVoz = (id: string) => /tts/i.test(id);

function rango(id: string, fallidos: string[] = []): number {
  // Lo que ya falló, al final del todo: es el único dato REAL de que algo no
  // sirve. La lista de OpenAI no dice cuáles están retirados.
  if (fallidos.includes(id)) return 5;
  if (/dall-e/.test(id)) return 4;
  if (esFechado(id)) return 3;
  // gpt-4o-mini-tts delante de tts-1: admite instrucciones de acento/fluidez.
  if (/gpt-4o.*tts|tts.*gpt-4o/i.test(id)) return 0;
  if (esDeVoz(id)) return 1;
  return 2;
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
  if (/gpt-4o.*tts|tts.*gpt-4o/i.test(id)) return "recomendado: fluido y con acento";
  if (/^tts-1-hd$/i.test(id)) return "calidad alta, sin instrucciones de estilo";
  if (/^tts-1$/i.test(id)) return "rápido y barato, sin instrucciones de estilo";
  if (esDeVoz(id)) return "lee el texto tal cual, sin añadir nada";
  if (/nano/.test(id)) return "el más pequeño y barato";
  if (/mini/.test(id)) return "reducido: más barato";
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
