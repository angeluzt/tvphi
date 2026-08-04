import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users, BookOpen, Layers, Sparkles, UserPlus, Activity, Bot, ArrowLeft,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { esAdminHistorias } from "@/lib/story/cupo";
import { cargarAdminStats, type AdminStats } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString("es", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Stat({
  label, value, hint, icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Users;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  if (!esAdminHistorias(user.email)) redirect("/");

  let stats: AdminStats;
  try {
    stats = await cargarAdminStats();
  } catch {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">Uso de la app</h1>
        <p className="card p-4 text-sm text-danger">No se pudieron cargar las estadísticas.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/story" className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> Historias
          </Link>
          <h1 className="text-xl font-bold">Uso de la app</h1>
          <p className="mt-1 text-sm text-muted">
            Solo visible para correos de <code className="text-xs">STORY_QUOTA_EXEMPT_EMAILS</code>.
            Actualizado {fmtFecha(stats.generadoEn)}.
          </p>
        </div>
      </div>

      <Seccion titulo="Cuentas">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat icon={Users} label="Cuentas totales" value={stats.cuentas.total}
            hint={`${stats.cuentas.admin} admin${stats.cuentas.admin === 1 ? "" : "s"}`} />
          <Stat icon={UserPlus} label="Altas (7 días)" value={stats.cuentas.ultimos7d}
            hint={`${stats.cuentas.ultimos30d} en 30 días`} />
          <Stat icon={BookOpen} label="Con al menos 1 historia" value={stats.cuentas.conHistoria}
            hint={`${stats.cuentas.sinHistoria} aún sin historia`} />
        </div>
      </Seccion>

      <Seccion titulo="Historias y series">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat icon={BookOpen} label="Historias (capítulos)" value={stats.historias.total}
            hint={`${stats.historias.enSerie} en serie · ${stats.historias.sueltas} sueltas`} />
          <Stat icon={Activity} label="Creadas (7 días)" value={stats.historias.ultimos7d}
            hint={`${stats.historias.ultimos30d} en 30 días · ${stats.historias.editadas7d} editadas esta semana`} />
          <Stat icon={Layers} label="Series" value={stats.series.total}
            hint={`${stats.series.ultimos30d} nuevas en 30 días · ${stats.personajes.total} personajes`} />
        </div>
      </Seccion>

      <Seccion titulo="IA">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat icon={Sparkles} label="Capítulos IA (24 h)" value={stats.ia.generaciones24h}
            hint="Generaciones registradas en la ventana de cupo" />
          <Stat icon={Bot} label="Cuentas con credencial IA" value={stats.ia.usuariosConCredencial}
            hint="Han tocado modelos / cupo de IA al menos una vez" />
        </div>
      </Seccion>

      <Seccion titulo="Cuentas con más historias">
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Cuenta</th>
                <th className="px-4 py-2.5 font-medium tabular-nums">Historias</th>
                <th className="px-4 py-2.5 font-medium tabular-nums">Series</th>
                <th className="px-4 py-2.5 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {stats.topCuentas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">Aún no hay cuentas.</td>
                </tr>
              )}
              {stats.topCuentas.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{u.displayName}</p>
                    <p className="truncate text-[11px] text-muted">@{u.username} · {u.email}</p>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{u.historias}</td>
                  <td className="px-4 py-2.5 tabular-nums">{u.series}</td>
                  <td className="px-4 py-2.5 text-[11px] text-muted">{fmtFecha(u.creada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion titulo="Altas recientes">
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Cuenta</th>
                <th className="px-4 py-2.5 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {stats.altasRecientes.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{u.displayName}</p>
                    <p className="truncate text-[11px] text-muted">@{u.username} · {u.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-muted">{fmtFecha(u.creada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  );
}
