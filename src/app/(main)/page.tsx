import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { esAdminHistorias } from "@/lib/story/cupo";
import {
  Sparkles, Mic, Image as ImageIcon, Music, Move, Wand2, Download, Layers, FlaskConical,
} from "lucide-react";

export const dynamic = "force-dynamic";

// La portada dice lo que la app HACE.
//
// Durante mucho tiempo prometía cámara, pantalla y grabar en vivo, que es de
// una etapa anterior y ya no existe: quien entraba buscaba eso y no lo
// encontraba. Ahora solo se cuenta lo de las historias narradas, que es lo
// único que se puede usar de verdad.

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
            Convierte tus imágenes en{" "}
            <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">
              un video narrado
            </span>{" "}
            — de esos de YouTube en los que no sales.
          </h1>
          <p className="mt-4 text-muted">
            Subes las imágenes, escribes lo que se cuenta en cada una y una voz IA lo narra. Le das
            movimiento de cámara y zoom, transiciones, lluvia, fuego o niebla, y música de la
            biblioteca. Al acabar se graba el video con la voz ya dentro y se descarga.
          </p>
          <p className="mt-3 text-sm text-muted">
            El video se monta y se graba <b className="text-fg">en tu navegador</b>: tus imágenes y
            audios no se suben a ningún sitio. En la cuenta solo se guarda el montaje —los textos y
            los ajustes— para que puedas seguir otro día.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {user ? (
              <Link href="/story" className="btn-brand">
                <Mic className="h-4 w-4" /> Historias narradas
              </Link>
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

      {/* Cómo funciona */}
      <section>
        <h2 className="mb-4 text-lg font-bold">Cómo funciona</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              n: "1",
              t: "Sube las imágenes y escribe",
              d: "Cada imagen es una escena. Escribes lo que se narra en ella y, si quieres, la partes en varias tomas con encuadres distintos.",
            },
            {
              n: "2",
              t: "Voz, movimiento y sonido",
              d: "La voz IA lee el texto y fija la duración. Añades zoom y desplazamientos, transiciones, efectos como lluvia o fuego, música de la biblioteca y efectos de sonido.",
            },
            {
              n: "3",
              t: "Exporta",
              d: "Se graba mientras se reproduce, así que tarda lo que dura el video, y se descarga en WebM o MP4 listo para subir.",
            },
          ].map((s) => (
            <div key={s.n} className="card p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/20 font-bold text-brand">{s.n}</span>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lo que trae puesto */}
      <section>
        <h2 className="mb-4 text-lg font-bold">Lo que ya trae dentro</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Music, t: "Biblioteca de música y sonidos", d: "Pistas y efectos listos para usar. No hay que buscar nada fuera ni preocuparse por licencias." },
            { icon: Wand2, t: "Efectos sobre la imagen", d: "Lluvia, nieve, niebla, fuego, humo, chispas, portales… colocados donde tú marques." },
            { icon: Mic, t: "Voz gratis en el navegador", d: "Suena algo robótica, pero no cuesta nada. Con clave de OpenAI puedes usar voces mejores." },
            { icon: Layers, t: "Series y capítulos", d: "Agrupa los videos de una misma historia y guarda personajes para que se parezcan entre capítulos." },
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
            Dibujar la escena como un mapa de formas, pedirle a la IA cada capa por separado y
            montarlas con profundidad, para que al mover la cámara el fondo y el primer plano no
            vayan a la misma velocidad. Sin terminar y sin sitio todavía dentro del editor.
          </p>
          <Link href="/lab" className="btn-ghost mt-4">
            <FlaskConical className="h-4 w-4 text-gold" /> Abrir el laboratorio
          </Link>
        </section>
      )}
    </div>
  );
}
