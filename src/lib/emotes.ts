// Utilidades de emotes, seguras para servidor (sin dependencias de UI ni del dataset).

export interface ChannelEmoteLite {
  code: string;
  imageUrl: string;
}

// Código válido para un emote de canal: se escribe como :codigo: en el chat.
export const EMOTE_CODE_RE = /^[a-zA-Z0-9_]{2,24}$/;
export const EMOTE_TOKEN_RE = /:([a-zA-Z0-9_]{2,24}):/g;

// Regex de caracteres de emoji (pictográficos + componentes + selectores + keycap).
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Component}‍️⃣]/gu;

// ¿El mensaje contiene únicamente emotes (emojis y/o :codigos: del canal) y espacios?
export function isEmoteOnly(body: string, codes: string[]): boolean {
  let s = body;
  for (const c of codes) s = s.split(`:${c}:`).join(" ");
  s = s.replace(EMOJI_RE, " ");
  return s.trim().length === 0;
}

// Tokeniza un mensaje en texto y emotes de canal (para renderizar imágenes).
export type EmoteToken = { type: "text"; value: string } | { type: "emote"; code: string; url: string };

export function tokenizeMessage(body: string, emotes: Record<string, string>): EmoteToken[] {
  const out: EmoteToken[] = [];
  let last = 0;
  for (const m of body.matchAll(EMOTE_TOKEN_RE)) {
    const code = m[1];
    const url = emotes[code];
    if (!url) continue; // no es un emote conocido: se deja como texto
    if (m.index! > last) out.push({ type: "text", value: body.slice(last, m.index) });
    out.push({ type: "emote", code, url });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ type: "text", value: body.slice(last) });
  return out;
}
