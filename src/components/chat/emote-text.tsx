import { tokenizeMessage } from "@/lib/emotes";

// Renderiza un mensaje: el texto tal cual (los emojis Unicode se ven solos) y
// los emotes de canal :codigo: como imágenes.
export function EmoteText({ body, emotes }: { body: string; emotes: Record<string, string> }) {
  const tokens = tokenizeMessage(body, emotes);
  return (
    <>
      {tokens.map((t, i) =>
        t.type === "text" ? (
          <span key={i}>{t.value}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={t.url}
            alt={t.code}
            title={`:${t.code}:`}
            className="-my-1 inline-block h-6 w-auto align-middle"
          />
        ),
      )}
    </>
  );
}
