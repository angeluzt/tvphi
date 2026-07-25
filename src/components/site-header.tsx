import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Clapperboard, LogOut, User } from "lucide-react";

interface HeaderUser {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-4 px-4">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/studio" className="btn-brand">
                <Clapperboard className="h-4 w-4" /> Studio
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-sm hover:bg-border/50"
                title="Tu cuenta"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-brand/20 text-brand">
                    <User className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="hidden max-w-[8rem] truncate sm:inline">{user.displayName}</span>
              </Link>
              <form action="/api/auth/logout" method="post">
                <button className="btn-ghost" title="Salir" type="submit">
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="btn-ghost">
                Entrar
              </Link>
              <Link href="/auth/register" className="btn-brand">
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
