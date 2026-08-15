"use client";

import type { PaletaIa } from "@/lib/story/paleta";

const INTERRUPTORES: { id: keyof Omit<PaletaIa, "still">; label: string; ayuda: string }[] = [
  { id: "paralaje", label: "2.5D / paralaje", ayuda: "Láminas con profundidad. Caro: una escena son varias imágenes." },
  { id: "apng", label: "Foto viva (APNG)", ayuda: "N fotos enteras en loop, cada una a partir de la anterior. No es una hoja partida." },
  { id: "sprites", label: "Sprites / actores", ayuda: "Tiras de la biblioteca. La IA puede proponerlos." },
  { id: "vfx", label: "Efectos", ayuda: "Fuego, lluvia, portal… del catálogo." },
  { id: "musica", label: "Música", ayuda: "Pistas de fondo en el capítulo." },
];

export function PaletaIaMandos({
  valor,
  onCambio,
}: {
  valor: PaletaIa;
  onCambio: (p: PaletaIa) => void;
}) {
  return (
    <div>
      <span className="text-xs text-muted">Qué puede crear la IA</span>
      <p className="mt-0.5 text-[10px] text-muted">
        Lo apagado no se inventa ni se gasta. La foto plana siempre está.
      </p>
      <div className="mt-1.5 grid gap-1">
        {INTERRUPTORES.map((it) => (
          <label key={it.id} className="flex items-start gap-2 rounded-lg border border-border px-2 py-1.5 text-[11px]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={valor[it.id]}
              onChange={(e) => onCambio({ ...valor, [it.id]: e.target.checked })}
            />
            <span className="min-w-0">
              <span className="block font-medium text-fg">{it.label}</span>
              <span className="block text-muted">{it.ayuda}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
