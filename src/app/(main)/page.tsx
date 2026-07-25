import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { LiveBadge } from "@/components/ui/live-badge";
import { Radio, Layers, MessageSquare, Coins, Bell, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [channels, user] = await Promise.all([
    prisma.channel.findMany({
      orderBy: [{ isLive: "desc" }, { lastLiveAt: "desc" }, { createdAt: "desc" }],
      take: 24,
      include: { owner: true },
    }),
    getCurrentUser(),
  ]);

  const live = channels.filter((c) => c.isLive);
  const rest = channels.filter((c) => !c.isLive);

  return (
    <div className="space-y-10">
      {/* Hero — solo para visitantes sin sesión */}
      {!user && (
      <section className="card relative overflow-hidden p-8 md:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="chip bg-brand/15 text-brand">
            <Sparkles className="h-3.5 w-3.5" /> Sin OBS necesario
          </span>
          <h1 className="mt-4 text-4xl font-black leading-tight md:text-5xl">
            Transmite en vivo con{" "}
            <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">
              escenas, capas y alertas
            </span>{" "}
            directamente desde tu navegador.
          </h1>
          <p className="mt-4 text-muted">
            Compón tu directo como en OBS pero online: cámara, pantalla, texto, imágenes,
            fondos y transiciones. Chat moderno con moderación, puntos y donaciones.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/studio" className="btn-brand">
              <Radio className="h-4 w-4" /> Abrir Studio
            </Link>
            <Link href="/auth/register" className="btn-ghost">
              Crear mi canal
            </Link>
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Layers, t: "Escenas y capas" },
            { icon: Bell, t: "Alertas de donación" },
            { icon: MessageSquare, t: "Chat + moderación" },
            { icon: Coins, t: "Puntos = dinero" },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-surface-2/60 p-3">
              <f.icon className="h-5 w-5 text-accent" />
              <p className="mt-2 text-sm font-medium">{f.t}</p>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* En vivo */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-bold">En vivo ahora</h2>
          <LiveBadge live={live.length > 0} />
        </div>
        {live.length === 0 ? (
          <p className="text-sm text-muted">Nadie transmite en este momento. ¡Sé el primero!</p>
        ) : (
          <ChannelGrid channels={live} />
        )}
      </section>

      {/* Canales */}
      {rest.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold">Canales</h2>
          <ChannelGrid channels={rest} />
        </section>
      )}
    </div>
  );
}

function ChannelGrid({
  channels,
}: {
  channels: Array<{
    slug: string;
    title: string;
    isLive: boolean;
    bannerUrl: string | null;
    owner: { displayName: string; avatarUrl: string | null };
  }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {channels.map((c) => (
        <Link key={c.slug} href={`/${c.slug}`} className="group card overflow-hidden">
          <div className="relative aspect-video bg-gradient-to-br from-surface-2 to-brand-soft/30">
            {c.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.bannerUrl} alt="" className="h-full w-full object-cover" />
            )}
            <div className="absolute left-2 top-2">
              <LiveBadge live={c.isLive} />
            </div>
          </div>
          <div className="flex items-center gap-3 p-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/20 text-sm font-bold text-brand">
              {c.owner.displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold group-hover:text-accent">{c.title}</p>
              <p className="truncate text-xs text-muted">{c.owner.displayName}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
