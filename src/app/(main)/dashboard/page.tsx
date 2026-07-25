import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Clapperboard, User as UserIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Tu cuenta</h1>

      <div className="card p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand/20 text-brand">
            <UserIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">{user.displayName}</p>
            <p className="truncate text-sm text-muted">@{user.username} · {user.email}</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-bold">Tus videos</h2>
        <p className="mt-1 text-sm text-muted">
          Los videos se graban y descargan en tu equipo — no se suben a ningún servidor.
          Tu proyecto (escenas y capas) se guarda solo en tu cuenta.
        </p>
        <Link href="/studio" className="btn-brand mt-4">
          <Clapperboard className="h-4 w-4" /> Abrir el Studio
        </Link>
      </div>
    </div>
  );
}
