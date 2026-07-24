"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket-client";
import { HlsPlayer } from "@/components/player/hls-player";
import { AlertOverlay } from "@/components/alerts/alert-overlay";
import { LiveBadge, ViewerCount } from "@/components/ui/live-badge";
import { formatCompact, formatMoney } from "@/lib/utils";
import { Coins, Gift, Zap } from "lucide-react";

interface Reward {
  id: string;
  title: string;
  cost: number;
  action: string;
}

export function ChannelInteractive({
  channelSlug,
  playbackUrl,
  isLive: initialLive,
  rewards,
  loggedIn,
  title,
}: {
  channelSlug: string;
  playbackUrl: string | null;
  isLive: boolean;
  rewards: Reward[];
  loggedIn: boolean;
  title: string;
}) {
  const [viewers, setViewers] = useState(0);
  const [isLive, setIsLive] = useState(initialLive);
  const [balance, setBalance] = useState<number | null>(null);
  const [donateOpen, setDonateOpen] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit("join", { channelSlug });
    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("presence", ({ viewers }) => setViewers(viewers));
    socket.on("points:update", ({ balance }) => setBalance(balance));
    socket.on("channel:settings", (s) => setIsLive(s.isLive));
    return () => {
      socket.off("connect", join);
      socket.off("presence");
      socket.off("points:update");
      socket.off("channel:settings");
    };
  }, [channelSlug]);

  function redeem(r: Reward) {
    if (!loggedIn) {
      window.location.href = "/auth/login";
      return;
    }
    let userInput: string | undefined;
    if (r.action === "SHOW_MESSAGE") {
      userInput = prompt("Mensaje para mostrar en el directo:") ?? undefined;
      if (userInput === undefined) return;
    }
    getSocket().emit("reward:redeem", { rewardId: r.id, userInput });
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
        {isLive && playbackUrl ? (
          <HlsPlayer src={playbackUrl} className="h-full w-full" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-surface-2 to-brand-soft/20 text-center">
            <div>
              <p className="text-lg font-semibold">El canal está offline</p>
              <p className="mt-1 text-sm text-muted">Vuelve cuando esté en vivo.</p>
            </div>
          </div>
        )}
        {/* Alertas superpuestas al video (las ven también los espectadores) */}
        <AlertOverlay channelSlug={channelSlug} transparent />
        {/* Badges */}
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <LiveBadge live={isLive} />
          {isLive && <ViewerCount count={viewers} />}
        </div>
      </div>

      {/* Barra de acciones: donar, puntos, rewards */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <button className="btn-brand" onClick={() => setDonateOpen(true)}>
          <Gift className="h-4 w-4" /> Donar
        </button>
        {balance !== null && (
          <span className="chip bg-gold/15 text-gold">
            <Coins className="h-3.5 w-3.5" /> {formatCompact(balance)} puntos
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {rewards.map((r) => (
            <button
              key={r.id}
              onClick={() => redeem(r)}
              className="btn-ghost"
              title={`Canjear por ${r.cost} puntos`}
            >
              <Zap className="h-3.5 w-3.5 text-brand" /> {r.title}
              <span className="ml-1 text-gold">{formatCompact(r.cost)}</span>
            </button>
          ))}
        </div>
      </div>

      {donateOpen && (
        <DonateModal
          channelSlug={channelSlug}
          title={title}
          onClose={() => setDonateOpen(false)}
        />
      )}
    </div>
  );
}

function DonateModal({
  channelSlug,
  title,
  onClose,
}: {
  channelSlug: string;
  title: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(5);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/donations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelSlug,
        displayName: name.trim() || "Anónimo",
        amountCents: Math.round(amount * 100),
        message: message.trim() || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Error");
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">Donar a {title}</h3>
        <p className="mt-1 text-sm text-muted">Tu apoyo aparece como alerta en el directo.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label">Monto (USD)</label>
            <div className="mt-1 flex gap-2">
              {[2, 5, 10, 25].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className={amount === v ? "btn-brand" : "btn-ghost"}
                >
                  {formatMoney(v * 100)}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="input mt-2"
            />
          </div>
          <div>
            <label className="label">Tu nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" placeholder="Anónimo" />
          </div>
          <div>
            <label className="label">Mensaje (opcional)</label>
            <input value={message} onChange={(e) => setMessage(e.target.value)} className="input mt-1" maxLength={200} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-brand" onClick={submit} disabled={loading}>
              {loading ? "Procesando…" : `Donar ${formatMoney(amount * 100)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
