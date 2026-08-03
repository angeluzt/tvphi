import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sparkles, User as UserIcon } from "lucide-react";

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
        <h2 className="text-lg font-bold">Tus historias</h2>
        <p className="mt-1 text-sm text-muted">
          Crea videos narrados con imágenes, voz IA y efectos. Se exportan en tu equipo.
        </p>
        <Link href="/story" className="btn-brand mt-4">
          <Sparkles className="h-4 w-4" /> Ir a Historias
        </Link>
      </div>
    </div>
  );
}
