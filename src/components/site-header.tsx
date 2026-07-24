import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Radio, LayoutDashboard, LogOut, User } from "lucide-react";

interface HeaderUser {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  channelSlug: string | null;
}

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-4 px-4">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="ml-2 hidden items-center gap-1 text-sm text-muted md:flex">
          <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-surface-2 hover:text-fg">
            Explorar
          </Link>
          <Link href="/studio" className="rounded-lg px-3 py-1.5 hover:bg-surface-2 hover:text-fg">
            Studio
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/studio" className="btn-brand hidden sm:inline-flex">
                <Radio className="h-4 w-4" /> Transmitir
              </Link>
              <Link href="/dashboard" className="btn-ghost" title="Panel">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Panel</span>
              </Link>
              {user.channelSlug && (
                <Link
                  href={`/${user.channelSlug}`}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-sm hover:bg-border/50"
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
              )}
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
