"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { ChannelEmoteLite } from "@/lib/emotes";

type EmojiItem = { native: string; name: string; keywords: string[] };

export function EmotePicker({
  channelEmotes,
  onPick,
  onClose,
}: {
  channelEmotes: ChannelEmoteLite[];
  onPick: (text: string) => void;
  onClose: () => void;
}) {
  const [emojis, setEmojis] = useState<EmojiItem[]>([]);
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ok = true;
    // El dataset de emojis se carga bajo demanda (code-splitting).
    import("@emoji-mart/data").then((m) => {
      const data: any = (m as any).default;
      const list: EmojiItem[] = Object.values(data.emojis)
        .map((e: any) => ({ native: e.skins?.[0]?.native ?? "", name: e.name ?? e.id, keywords: e.keywords ?? [] }))
        .filter((e: EmojiItem) => e.native);
      if (ok) setEmojis(list);
    });
    try {
      setRecents(JSON.parse(localStorage.getItem("tvphi:emoteRecents") || "[]"));
    } catch {}
    return () => { ok = false; };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  function pick(value: string) {
    onPick(value);
    setRecents((prev) => {
      const next = [value, ...prev.filter((v) => v !== value)].slice(0, 21);
      try { localStorage.setItem("tvphi:emoteRecents", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const query = q.trim().toLowerCase();
  const filteredEmojis = (query
    ? emojis.filter((e) => e.name.toLowerCase().includes(query) || e.keywords.some((k) => k.includes(query)))
    : emojis
  ).slice(0, 300);
  const filteredChannel = query
    ? channelEmotes.filter((e) => e.code.toLowerCase().includes(query))
    : channelEmotes;

  return (
    <div ref={ref} className="absolute bottom-full right-0 z-40 mb-2 w-72 rounded-2xl border border-border bg-surface p-2 shadow-card">
      <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-2">
        <Search className="h-3.5 w-3.5 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar emote…"
          className="w-full bg-transparent py-1.5 text-sm outline-none"
        />
      </div>
      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        {filteredChannel.length > 0 && (
          <Section title="Del canal">
            {filteredChannel.map((e) => (
              <button key={e.code} title={`:${e.code}:`} onClick={() => pick(`:${e.code}:`)} className="grid h-8 w-8 place-items-center rounded hover:bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.imageUrl} alt={e.code} className="max-h-7 max-w-7" />
              </button>
            ))}
          </Section>
        )}
        {!query && recents.length > 0 && (
          <Section title="Recientes">
            {recents.map((r, i) =>
              r.startsWith(":") ? (
                <ChannelBtn key={i} token={r} emotes={channelEmotes} onPick={pick} />
              ) : (
                <button key={i} onClick={() => pick(r)} className="h-8 w-8 rounded text-xl leading-8 hover:bg-surface-2">{r}</button>
              ),
            )}
          </Section>
        )}
        <Section title="Emojis">
          {filteredEmojis.map((e, i) => (
            <button key={i} title={e.name} onClick={() => pick(e.native)} className="h-8 w-8 rounded text-xl leading-8 hover:bg-surface-2">{e.native}</button>
          ))}
          {emojis.length > 0 && filteredEmojis.length === 0 && (
            <p className="col-span-7 py-2 text-center text-xs text-muted">Sin resultados</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      <div className="grid grid-cols-7 gap-0.5">{children}</div>
    </div>
  );
}

function ChannelBtn({ token, emotes, onPick }: { token: string; emotes: ChannelEmoteLite[]; onPick: (t: string) => void }) {
  const code = token.replace(/:/g, "");
  const e = emotes.find((x) => x.code === code);
  if (!e) return null;
  return (
    <button title={token} onClick={() => onPick(token)} className="grid h-8 w-8 place-items-center rounded hover:bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={e.imageUrl} alt={code} className="max-h-7 max-w-7" />
    </button>
  );
}
