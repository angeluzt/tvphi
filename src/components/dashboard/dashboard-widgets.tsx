"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn, formatCompact, formatMoney } from "@/lib/utils";
import { Coins, Megaphone, Banknote, Plus, Trash2, Gift } from "lucide-react";

export function SettingsForm({
  initial,
}: {
  initial: { title: string; description: string; subscriberOnlyChat: boolean; slowModeSeconds: number; emoteOnly: boolean };
}) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function save() {
    await fetch("/api/channel/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Título del canal</label>
        <input className="input mt-1" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} />
      </div>
      <div>
        <label className="label">Descripción</label>
        <textarea className="input mt-1" rows={3} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} />
      </div>
      <Toggle label="Chat solo para suscriptores" desc="Limita el chat a quienes ya pagan" checked={s.subscriberOnlyChat} onChange={(v) => setS({ ...s, subscriberOnlyChat: v })} />
      <Toggle label="Modo solo emotes" checked={s.emoteOnly} onChange={(v) => setS({ ...s, emoteOnly: v })} />
      <div>
        <label className="label">Modo lento (segundos)</label>
        <input type="number" min={0} max={600} className="input mt-1" value={s.slowModeSeconds} onChange={(e) => setS({ ...s, slowModeSeconds: Number(e.target.value) })} />
      </div>
      <button className="btn-brand" onClick={save}>{saved ? "Guardado ✓" : "Guardar ajustes"}</button>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 p-3 text-left">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {desc && <span className="block text-xs text-muted">{desc}</span>}
      </span>
      <span className={cn("relative h-6 w-11 rounded-full transition", checked ? "bg-brand" : "bg-border")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function RewardsManager({ initial }: { initial: Array<{ id: string; title: string; cost: number; action: string }> }) {
  const [rewards, setRewards] = useState(initial);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState(100);
  const [action, setAction] = useState("SHOW_MESSAGE");

  async function add() {
    if (!title.trim()) return;
    const res = await fetch("/api/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, cost, action }),
    });
    const data = await res.json();
    if (res.ok) {
      setRewards((r) => [...r, data.reward]);
      setTitle("");
    }
  }
  async function remove(id: string) {
    await fetch(`/api/rewards/${id}`, { method: "DELETE" });
    setRewards((r) => r.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rewards.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-2 text-sm">
            <Gift className="h-4 w-4 text-brand" />
            <span className="flex-1 truncate">{r.title}</span>
            <span className="chip bg-gold/15 text-gold">{formatCompact(r.cost)}</span>
            <button onClick={() => remove(r.id)} className="text-muted hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {rewards.length === 0 && <p className="text-sm text-muted">Aún no hay recompensas.</p>}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_150px_auto]">
        <input className="input" placeholder="Nombre del reward" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" type="number" min={1} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
        <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="SHOW_MESSAGE">Mostrar mensaje</option>
          <option value="PLAY_SOUND">Reproducir sonido</option>
          <option value="CHANGE_SCENE">Cambiar escena</option>
          <option value="CUSTOM">Personalizado</option>
        </select>
        <button className="btn-brand" onClick={add}><Plus className="h-4 w-4" /> Añadir</button>
      </div>
    </div>
  );
}

export function MonetizationPanel({ balance, pointsPerUsd }: { balance: number; pointsPerUsd: number }) {
  const [bal, setBal] = useState(balance);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function simulateAds() {
    const res = await fetch("/api/monetization/simulate-ads", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setBal(data.newBalance);
      setMsg(`+${formatCompact(data.pointsMinted)} pts por ${data.impressions} impresiones (${formatMoney(data.revenueCents)})`);
      router.refresh();
    }
  }
  async function payout() {
    const res = await fetch("/api/monetization/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: bal }),
    });
    const data = await res.json();
    if (res.ok) {
      setBal(0);
      setMsg(`Retiro solicitado: ${formatMoney(data.payout.amountCents)} (simulado)`);
      router.refresh();
    } else setMsg(data.error);
  }

  const usd = bal / pointsPerUsd;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
        <Coins className="h-8 w-8 text-gold" />
        <div>
          <p className="text-2xl font-black text-gold">{formatCompact(bal)} pts</p>
          <p className="text-xs text-muted">≈ {formatMoney(Math.round(usd * 100))} · {pointsPerUsd} pts = $1</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={simulateAds}>
          <Megaphone className="h-4 w-4 text-accent" /> Simular ingresos por ads
        </button>
        <button className="btn-brand" onClick={payout} disabled={bal <= 0}>
          <Banknote className="h-4 w-4" /> Solicitar retiro
        </button>
      </div>
      {msg && <p className="text-sm text-accent">{msg}</p>}
      <p className="text-xs text-muted">
        Los ingresos por publicidad y los retiros son <strong>simulados</strong> en esta versión.
        La integración real requiere una red de anuncios aprobada y verificación (KYC/Stripe Connect).
      </p>
    </div>
  );
}
