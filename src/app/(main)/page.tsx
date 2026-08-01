import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Clapperboard, Layers, Scissors, Download, Camera, MonitorUp, Sparkles, Mic, Image as ImageIcon, Music } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-10">
      <section className="card relative overflow-hidden p-8 md:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="chip bg-brand/15 text-brand">
            <Sparkles className="h-3.5 w-3.5" /> 100% en tu navegador
          </span>
          <h1 className="mt-4 text-4xl font-black leading-tight md:text-5xl">
            Graba y edita videos con{" "}
            <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">
              cámara, pantalla y capas
            </span>{" "}
            — listos para YouTube.
          </h1>
          <p className="mt-4 text-muted">
            Compón tu video como en un estudio: cámara, pantalla, texto, imágenes, fondos y cambios
            de escena en vivo. Graba con pausa, recorta y descarga en alta calidad. Ideal para cursos
            y contenido. Sin instalar nada y sin subir tus videos a ningún servidor.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {user ? (
              <>
                {/* Lo que hace esta app es contar historias: es lo primero y
                    lo único que se ofrece al entrar. */}
                <Link href="/story" className="btn-brand">
                  <Mic className="h-4 w-4" /> Historias narradas
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth/register" className="btn-brand">
                  Empezar gratis
                </Link>
                <Link href="/auth/login" className="btn-ghost">
                  Entrar
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { icon: Camera, t: "Cámara" },
            { icon: MonitorUp, t: "Pantalla" },
            { icon: Layers, t: "Capas y escenas" },
            { icon: Clapperboard, t: "Grabar / pausar" },
            { icon: Scissors, t: "Recortar" },
            { icon: Download, t: "Descargar WebM" },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-surface-2/60 p-3">
              <f.icon className="h-5 w-5 text-accent" />
              <p className="mt-2 text-sm font-medium">{f.t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Historias narradas */}
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative">
          <span className="chip bg-accent/15 text-accent">
            <Mic className="h-3.5 w-3.5" /> Nuevo
          </span>
          <h2 className="mt-3 text-2xl font-bold">Historias narradas — videos sin cámara</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Sube tus imágenes, escribe el texto de cada una y una voz IA lo narra. Dale movimiento y
            zoom, transiciones, stickers PNG y capas de música y efectos. Exporta el video con la voz
            ya incrustada — ideal para esos videos de YouTube sin salir en cámara.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: ImageIcon, t: "Tus imágenes" },
              { icon: Mic, t: "Voz IA gratis" },
              { icon: Layers, t: "Movimiento y zoom" },
              { icon: Music, t: "Música y efectos" },
            ].map((f) => (
              <div key={f.t} className="rounded-xl border border-border bg-surface-2/60 p-3">
                <f.icon className="h-5 w-5 text-accent" />
                <p className="mt-2 text-sm font-medium">{f.t}</p>
              </div>
            ))}
          </div>
          <Link href={user ? "/story" : "/auth/register"} className="btn-brand mt-5">
            <Sparkles className="h-4 w-4" /> Crear una historia
          </Link>
        </div>
      </section>

      {/* Cómo funciona */}
      <section>
        <h2 className="mb-4 text-lg font-bold">Cómo funciona</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { n: "1", t: "Compón tus escenas", d: "Añade cámara, pantalla, texto, imágenes y fondos. Crea escenas (intro, pantalla del curso, cámara…)." },
            { n: "2", t: "Graba", d: "Pulsa Grabar, cambia de escena en vivo, pausa/reanuda cuando quieras. Añade música de fondo." },
            { n: "3", t: "Recorta y descarga", d: "Ajusta inicio y fin y descarga el video en WebM, listo para subir a YouTube." },
          ].map((s) => (
            <div key={s.n} className="card p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/20 font-bold text-brand">{s.n}</span>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
