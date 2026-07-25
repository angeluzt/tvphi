"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket-client";
import type {
  ChatMessagePayload,
  ChannelRoleName,
  ChannelSettings,
} from "@/lib/realtime/events";
import { cn, formatCompact } from "@/lib/utils";
import { Coins, Send, Shield, Ban, Clock, Trash2, Plus, Smile } from "lucide-react";
import { EmotePicker } from "./emote-picker";
import { EmoteText } from "./emote-text";
import type { ChannelEmoteLite } from "@/lib/emotes";

const roleStyle: Record<ChannelRoleName, string> = {
  BROADCASTER: "text-gold",
  MODERATOR: "text-success",
  SUBSCRIBER: "text-accent",
  VIEWER: "text-fg",
};
const roleLabel: Record<ChannelRoleName, string> = {
  BROADCASTER: "Host",
  MODERATOR: "Mod",
  SUBSCRIBER: "Sub",
  VIEWER: "",
};

function order(r: ChannelRoleName) {
  return ["VIEWER", "SUBSCRIBER", "MODERATOR", "BROADCASTER"].indexOf(r);
}

export function ChatBox({
  channelSlug,
  loggedIn,
  emotes = [],
}: {
  channelSlug: string;
  loggedIn: boolean;
  emotes?: ChannelEmoteLite[];
}) {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [role, setRole] = useState<ChannelRoleName>("VIEWER");
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ level: "info" | "error"; message: string } | null>(null);
  const [input, setInput] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const isMod = order(role) >= order("MODERATOR");
  const emoteMap = Object.fromEntries(emotes.map((e) => [e.code, e.imageUrl]));

  function insertEmote(t: string) {
    setInput((prev) => prev + (prev && !prev.endsWith(" ") ? " " : "") + t + " ");
  }

  const scrollDown = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const join = () =>
      socket.emit("join", { channelSlug }, (ack) => {
        if (ack.ok) {
          setRole(ack.role);
          setSettings(ack.settings);
        }
      });
    if (socket.connected) join();
    socket.on("connect", join);

    socket.on("chat:history", (msgs) => {
      setMessages(msgs);
      setTimeout(scrollDown, 0);
    });
    socket.on("chat:message", (m) => {
      setMessages((prev) => [...prev.slice(-200), m]);
      setTimeout(scrollDown, 0);
    });
    socket.on("chat:delete", ({ messageId }) =>
      setMessages((prev) => prev.filter((m) => m.id !== messageId)),
    );
    socket.on("channel:settings", setSettings);
    socket.on("points:update", ({ balance }) => setBalance(balance));
    socket.on("system:notice", (n) => {
      setNotice(n);
      setTimeout(() => setNotice(null), 4000);
    });

    return () => {
      socket.off("connect", join);
      socket.off("chat:history");
      socket.off("chat:message");
      socket.off("chat:delete");
      socket.off("channel:settings");
      socket.off("points:update");
      socket.off("system:notice");
    };
  }, [channelSlug, scrollDown]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    getSocket().emit("chat:send", { body });
    setInput("");
  }

  function mod(type: any, targetUsername?: string, messageId?: string, seconds?: number) {
    getSocket().emit("mod", { type, targetUsername, messageId, seconds });
  }
  function award(targetUsername: string) {
    const amount = Number(prompt(`¿Cuántos puntos dar a @${targetUsername}?`, "100"));
    if (amount > 0) getSocket().emit("award", { targetUsername, amount });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Chat</span>
        <div className="flex items-center gap-2">
          {settings?.subscriberOnlyChat && (
            <span className="chip bg-accent/15 text-accent">Solo subs</span>
          )}
          {balance !== null && (
            <span className="chip bg-gold/15 text-gold">
              <Coins className="h-3 w-3" /> {formatCompact(balance)}
            </span>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs text-muted">Sé el primero en escribir 👋</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="group flex items-start gap-1 rounded-lg px-1 py-0.5 hover:bg-surface-2/60">
            <p className="min-w-0 flex-1 leading-snug">
              {roleLabel[m.user.role] && (
                <span className="mr-1 inline-flex items-center gap-0.5 align-middle">
                  <Shield className={cn("h-3 w-3", roleStyle[m.user.role])} />
                </span>
              )}
              <span className={cn("font-semibold", roleStyle[m.user.role])}>
                {m.user.displayName}
              </span>
              <span className="text-muted">: </span>
              <span className="break-words text-fg/90">
                <EmoteText body={m.body} emotes={emoteMap} />
              </span>
            </p>
            {isMod && m.user.role !== "BROADCASTER" && (
              <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <button title="Dar puntos" onClick={() => award(m.user.username)} className="rounded p-1 text-gold hover:bg-surface-2">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button title="Timeout 10m" onClick={() => mod("TIMEOUT", m.user.username, undefined, 600)} className="rounded p-1 text-muted hover:bg-surface-2">
                  <Clock className="h-3.5 w-3.5" />
                </button>
                <button title="Borrar" onClick={() => mod("DELETE_MESSAGE", undefined, m.id)} className="rounded p-1 text-muted hover:bg-surface-2">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button title="Banear" onClick={() => mod("BAN", m.user.username)} className="rounded p-1 text-danger hover:bg-surface-2">
                  <Ban className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>

      {notice && (
        <div
          className={cn(
            "mx-3 mb-1 rounded-lg px-3 py-1.5 text-xs",
            notice.level === "error" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent",
          )}
        >
          {notice.message}
        </div>
      )}

      <form onSubmit={send} className="border-t border-border p-3">
        {loggedIn ? (
          <div className="relative flex items-center gap-2">
            {showPicker && (
              <EmotePicker channelEmotes={emotes} onPick={insertEmote} onClose={() => setShowPicker(false)} />
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe un mensaje…"
              maxLength={500}
              className="input"
            />
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="btn-ghost shrink-0"
              aria-label="Emotes"
            >
              <Smile className="h-4 w-4" />
            </button>
            <button className="btn-brand shrink-0" aria-label="Enviar">
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <a href="/auth/login" className="btn-ghost w-full">
            Inicia sesión para chatear
          </a>
        )}
      </form>
    </div>
  );
}
