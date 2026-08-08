import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { esAdminHistorias } from "@/lib/story/cupo";
import {
  Sparkles, Mic, Image as ImageIcon, Music, Move, Wand2, Download, Layers, FlaskConical,
} from "lucide-react";

export const dynamic = "force-dynamic";

// La portada dice lo que la app HACE, y lo dice corto.
//
// EL BOTÓN VA ARRIBA, pegado al titular. Antes había dos párrafos entre el
// título y el botón: quien llega no lee, mira y decide, y si para decidir hay
// que bajar la página, se va. Lo que se explica, se explica DESPUÉS del botón,
// para quien quiera saber más antes de entrar.
//
// (Durante mucho tiempo esta página prometía cámara y grabar en vivo, que es de
// una etapa anterior y ya no existe. Ahora solo se cuenta lo de las historias
// narradas, que es lo único que se puede usar de verdad.)

export default async function HomePage() {
  const user = await getCurrentUser();
  const admin = !!user && esAdminHistorias(user.email);

  return (
    <div className="space-y-10">
      <section className="card relative overflow-hidden p-8 md:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="chip bg-brand/15 text-brand">
            <Sparkles className="h-3.5 w-3.5" /> Sin cámara y sin instalar nada
          </span>
          <h1 className="mt-4 text-4xl font-black leading-tight md:text-5xl">
            Tus imágenes,{" "}
            <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">
              un video narrado
            </span>
          </h1>

          {/* El botón, aquí. Nada entre el titular y él. */}
          <div className="mt-6 flex flex-wrap gap-3">
            {user ? (
              <Link href="/story" className="btn-brand">
                <Mic className="h-4 w-4" /> Comenzar
              </Link>
            ) : (
              <>
                <Link href="/auth/register" className="btn-brand">
                  Comenzar gratis
                </Link>
                <Link href="/auth/login" className="btn-ghost">
                  Entrar
                </Link>
              </>
            )}
          </div>

          <p className="mt-5 text-muted">
            Escribes lo que se cuenta, una voz IA lo narra y la cámara se mueve sola. Se graba{" "}
            <b className="text-fg">en tu navegador</b>: tus imágenes no se suben a ningún sitio.
          </p>
        </div>

        <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { icon: ImageIcon, t: "Tus imágenes" },
            { icon: Mic, t: "Voz IA" },
            { icon: Move, t: "Movimiento y zoom" },
            { icon: Wand2, t: "Efectos" },
            { icon: Music, t: "Música y sonidos" },
            { icon: Download, t: "Descargar el video" },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-surface-2/60 p-3">
              <f.icon className="h-5 w-5 text-accent" />
              <p className="mt-2 text-sm font-medium">{f.t}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">En tres pasos</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { n: "1", t: "Sube y escribe", d: "Cada imagen es una escena, con su texto." },
            { n: "2", t: "Voz y movimiento", d: "La voz marca la duración. Añades zoom, efectos y música." },
            { n: "3", t: "Descarga", d: "Sale en WebM o MP4, listo para subir." },
          ].map((s) => (
            <div key={s.n} className="card p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/20 font-bold text-brand">{s.n}</span>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Ya viene dentro</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Music, t: "Música y sonidos", d: "Listos para usar, sin líos de licencias." },
            { icon: Wand2, t: "Efectos", d: "Lluvia, nieve, niebla, fuego, humo, portales." },
            { icon: Mic, t: "Voz gratis", d: "La del navegador no cuesta nada. Las de IA suenan mejor." },
            { icon: Layers, t: "Series y personajes", d: "Capítulos de una misma historia, con los mismos personajes." },
          ].map((f) => (
            <div key={f.t} className="card p-5">
              <f.icon className="h-5 w-5 text-accent" />
              <h3 className="mt-3 font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Solo para quien administra: lo que se está probando y todavía no
          existe para el resto. */}
      {admin && (
        <section className="card border-gold/50 bg-gold/5 p-6">
          <span className="chip bg-gold/15 text-gold">
            <FlaskConical className="h-3.5 w-3.5" /> En pruebas · solo tú ves esto
          </span>
          <h2 className="mt-3 text-xl font-bold">Escenas por capas con paralaje</h2>
          <p className="mt-2 max-w-2xl text-muted">
            La IA dibuja cada capa por separado y se montan con profundidad, para que el fondo y el
            primer plano no se muevan igual. Sin terminar.
          </p>
          <Link href="/lab" className="btn-ghost mt-4">
            <FlaskConical className="h-4 w-4 text-gold" /> Abrir el laboratorio
          </Link>
        </section>
      )}
    </div>
  );
}
