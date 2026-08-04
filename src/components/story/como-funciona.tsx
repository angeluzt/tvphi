"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

// Cómo funciona la app, en la propia app.
//
// Va plegado: quien ya sabe no lo ve, y quien llega nuevo no tiene que
// adivinar qué es una «toma» ni por qué la música se pone al 12%. Está
// escrito por el orden en que se hace un vídeo, no por el orden en que está
// programado.

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{titulo}</p>
        <div className="mt-0.5 space-y-1 text-[12.5px] leading-relaxed text-muted">{children}</div>
      </div>
    </div>
  );
}

export function ComoFunciona() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-left"
        aria-expanded={abierto}
      >
        <HelpCircle className="h-4 w-4 shrink-0 text-accent" />
        <span className="label flex-1">Cómo funciona esto</span>
        <span className="text-[11px] text-muted">{abierto ? "ocultar" : "leer"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="space-y-4 border-t border-border p-4 pt-3">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Un vídeo aquí son <b className="text-fg">imágenes quietas con la cámara moviéndose por
            encima</b> y una voz contando la historia. No hace falta grabar nada.
          </p>

          <Paso n={1} titulo="Escenas y tomas">
            <p>
              Una <b className="text-fg">escena</b> es UNA imagen. Dentro de ella, una{" "}
              <b className="text-fg">toma</b> es un encuadre sobre esa misma imagen: un plano
              abierto y luego un primer plano son dos tomas de la misma foto.
            </p>
            <p>
              Es lo que hace que un vídeo de fotos parezca rodado: la cámara se acerca, se aleja o
              se desplaza mientras se narra.
            </p>
          </Paso>

          <Paso n={2} titulo="La voz manda sobre el tiempo">
            <p>
              Escribes el texto de cada toma y se narra con voz IA. Con{" "}
              <b className="text-fg">«Según los diálogos»</b> la toma dura exactamente lo que dure
              su voz, así que nunca se corta una frase.
            </p>
            <p>
              Si pones duración <b className="text-fg">fija</b>, la toma NO se estira: úsala solo en
              planos sin texto. Si la voz no cabe, la app te avisa y te ofrece alargarla.
            </p>
          </Paso>

          <Paso n={3} titulo="Efectos: de la foto o del cuadro">
            <p>
              Un efecto pegado a la foto —fuego, humo, un portal, una lámpara— se queda en su sitio
              y <b className="text-fg">crece si te acercas</b>, como si estuviera de verdad ahí.
              Ponlos en la escena una sola vez.
            </p>
            <p>
              La lluvia, la nieve y la niebla con forma «arriba» son del cuadro: llenan la pantalla
              y no cambian al acercarse, que es lo que se espera del clima.
            </p>
          </Paso>

          <Paso n={4} titulo="Sonido: golpes y ambientes">
            <p>
              Un <b className="text-fg">golpe</b> (un trueno, un portazo) dura un instante y va al
              80%. Un <b className="text-fg">ambiente</b> (lluvia, taberna, hoguera) va en bucle
              bajo toda la escena y al 12%.
            </p>
            <p>
              La música y los ambientes <b className="text-fg">bajan solos mientras se narra</b> y
              vuelven al acabar la frase. Por eso el porcentaje que ves es el de los silencios: no
              hace falta ponerlo bajísimo para que se entienda la voz.
            </p>
            <p>Cada sonido tiene un botón de escuchar, para juzgarlo sin reproducir el vídeo entero.</p>
          </Paso>

          <Paso n={5} titulo="Dónde vive cada cosa">
            <p>
              Los textos y los ajustes se guardan en tu cuenta. Las{" "}
              <b className="text-fg">imágenes y los audios que subes tú</b> se quedan en este
              navegador, no en el servidor: si abres el proyecto en otro equipo, te los pedirá.
            </p>
            <p>
              La música y los sonidos de la app son la excepción: viajan dentro de la aplicación y
              nunca faltan.
            </p>
            <p>
              Con <b className="text-fg">«Exportar proyecto»</b> te llevas un ZIP con el montaje y
              tus archivos. Los de la app no van dentro —su licencia permite usarlos en tus vídeos,
              no repartirlos sueltos—, pero se reconocen solos al volver a abrirlo.
            </p>
          </Paso>

          <Paso n={6} titulo="Y al final, el vídeo">
            <p>
              <b className="text-fg">Exportar</b> genera el vídeo en tu propio navegador y lo
              descarga. Tarda lo que dura el vídeo, porque se graba mientras se reproduce: no
              cierres la pestaña.
            </p>
          </Paso>

          <p className="border-t border-border pt-3 text-[12px] text-muted">
            <b className="text-fg">Si usas la IA para escribir el capítulo</b>, hace todo esto por
            ti —escenas, tomas, textos, efectos y música— y lo deja abierto para que lo retoques. Lo
            que genere se puede cambiar entero: no hay nada bloqueado.
          </p>
        </div>
      )}
    </div>
  );
}
