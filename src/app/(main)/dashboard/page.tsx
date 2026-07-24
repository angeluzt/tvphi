import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getBalance } from "@/lib/points/ledger";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/utils";
import { SettingsForm, RewardsManager, MonetizationPanel } from "@/components/dashboard/dashboard-widgets";
import { LiveBadge } from "@/components/ui/live-badge";
import { Radio, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  if (!user.channel) redirect("/auth/register");
  const channel = user.channel;

  const [balance, rewards, donations, donationAgg, recentDonations, overlay] = await Promise.all([
    getBalance(channel.id, user.id),
    prisma.channelReward.findMany({ where: { channelId: channel.id }, orderBy: { cost: "asc" } }),
    prisma.donation.count({ where: { channelId: channel.id, status: "COMPLETED" } }),
    prisma.donation.aggregate({ where: { channelId: channel.id, status: "COMPLETED" }, _sum: { amountCents: true } }),
    prisma.donation.findMany({ where: { channelId: channel.id, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.overlayToken.findFirst({ where: { channelId: channel.id } }),
  ]);

  const totalDonations = donationAgg._sum.amountCents ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Panel de {channel.title}</h1>
          <div className="mt-1 flex items-center gap-2">
            <LiveBadge live={channel.isLive} />
            <Link href={`/${channel.slug}`} className="text-sm text-accent hover:underline">
              tvphi.com/{channel.slug} <ExternalLink className="inline h-3 w-3" />
            </Link>
          </div>
        </div>
        <Link href="/studio" className="btn-brand">
          <Radio className="h-4 w-4" /> Abrir Studio
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Donaciones" value={formatMoney(totalDonations)} sub={`${donations} completadas`} />
        <Kpi label="Recompensas" value={String(rewards.length)} sub="activas" />
        <Kpi label="Estado" value={channel.isLive ? "En vivo" : "Offline"} />
        <Kpi label="Proveedor de video" value={env.mediaProvider === "cloudflare" ? "Cloudflare" : "Demo (mock)"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Monetización */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">Monetización · Puntos</h2>
          <MonetizationPanel balance={Number(balance)} pointsPerUsd={env.pointsPerUsd} />
        </section>

        {/* Donaciones recientes */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">Donaciones recientes</h2>
          {recentDonations.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay donaciones.</p>
          ) : (
            <ul className="space-y-2">
              {recentDonations.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.displayName}</p>
                    {d.message && <p className="truncate text-xs text-muted">{d.message}</p>}
                  </div>
                  <span className="font-bold text-gold">{formatMoney(d.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ajustes del canal y chat */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">Canal y chat</h2>
          <SettingsForm
            initial={{
              title: channel.title,
              description: channel.description ?? "",
              subscriberOnlyChat: channel.subscriberOnlyChat,
              slowModeSeconds: channel.slowModeSeconds,
              emoteOnly: channel.emoteOnly,
            }}
          />
        </section>

        {/* Rewards */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold">Recompensas por puntos</h2>
          <p className="mb-3 text-xs text-muted">
            Los espectadores canjean puntos por acciones que aparecen en tu directo.
          </p>
          <RewardsManager initial={rewards.map((r) => ({ id: r.id, title: r.title, cost: r.cost, action: r.action }))} />
        </section>
      </div>

      {overlay && (
        <section className="card p-5">
          <h2 className="mb-2 text-lg font-bold">Overlay para OBS</h2>
          <p className="text-sm text-muted">
            Añade esta URL como <em>Browser Source</em> en OBS para mostrar alertas si transmites desde OBS:
          </p>
          <code className="mt-2 block overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs">
            {env.appUrl}/overlay/{overlay.token}
          </code>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="label">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
