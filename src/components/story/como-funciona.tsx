"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

// Cómo funciona la app, en la propia app.
//
// Va plegado y va CORTO. Antes eran seis apartados de prosa: quien llegaba
// nuevo no se los leía, y quien ya sabía tampoco. Aquí queda solo lo que no se
// adivina probando —qué es una toma, por qué la música se ve al 12%, dónde
// viven las imágenes—; lo que se entiende tocando un botón se ha quitado.

function Fila({ que, children }: { que: string; children: React.ReactNode }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-muted">
      <b className="text-fg">{que}</b> {children}
    </p>
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
        <span className="label flex-1">Cómo funciona</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="space-y-2 border-t border-border p-4 pt-3">
          <Fila que="Escena">= una imagen. <b className="text-fg">Toma</b> = un encuadre sobre ella. Varias tomas de la misma foto es lo que hace que parezca rodado.</Fila>
          <Fila que="Duración">«Según los diálogos» = la toma dura lo que dure la voz. Fija solo para planos sin texto.</Fila>
          <Fila que="Efectos">Fuego, humo o un portal van en la escena: se quedan en su sitio y crecen al acercarte. Lluvia y niebla llenan la pantalla.</Fila>
          <Fila que="Sonido">La música baja sola mientras se narra, así que el % que ves es el de los silencios.</Fila>
          <Fila que="Tus archivos">Las imágenes y audios que subes se quedan en este navegador. En otro equipo te los vuelve a pedir.</Fila>
          <Fila que="Exportar">Genera el video aquí mismo y lo descarga. Tarda lo que dura el video: no cierres la pestaña.</Fila>
        </div>
      )}
    </div>
  );
}
