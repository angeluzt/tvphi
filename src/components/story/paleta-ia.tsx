"use client";

import type { PaletaIa } from "@/lib/story/paleta";

const INTERRUPTORES: { id: keyof Omit<PaletaIa, "still">; label: string; ayuda: string }[] = [
  { id: "paralaje", label: "2.5D / paralaje", ayuda: "Láminas con profundidad. Lo más caro: de 3 a 6 imágenes por escena, más 5 por cada lámina que respire." },
  { id: "apng", label: "Foto viva", ayuda: "La escena se mueve. Repintando la foto entera cuadro a cuadro (agua, fuego, humo) o con actores recortados encima, si enciendes los sprites." },
  { id: "sprites", label: "Actores recortados", ayuda: "Un pájaro, alguien que cruza, un barco: UNA imagen por actor en vez de una por fotograma, y la foto de debajo no se toca. Abre la foto viva con actores." },
  { id: "vfx", label: "Efectos", ayuda: "Fuego, lluvia, portal… del catálogo." },
  { id: "musica", label: "Música", ayuda: "Pistas de fondo en el capítulo." },
];

/** Cuántas escenas de cada medio, si no se deja al azar. */
export interface MezclaMedios {
  apng: number;
  paralaje: number;
}

export function PaletaIaMandos({
  valor,
  onCambio,
  escenas,
  mezcla,
  onMezcla,
}: {
  valor: PaletaIa;
  onCambio: (p: PaletaIa) => void;
  /** Cuántas escenas va a tener el capítulo, para topar la mezcla. */
  escenas?: number;
  /** null = lo reparte el azar (lo normal). Un objeto = lo pide el usuario. */
  mezcla?: MezclaMedios | null;
  onMezcla?: (m: MezclaMedios | null) => void;
}) {
  const hayVivos = valor.apng || valor.paralaje;
  const tope = Math.max(1, escenas ?? 6);
  return (
    <div>
      <span className="text-xs text-muted">Qué puede crear la IA</span>
      <p className="mt-0.5 text-[10px] text-muted">
        Lo apagado no se inventa ni se gasta. La foto plana siempre está. Cuántas escenas lleva
        cada cosa lo reparte la app, y cambia en cada generación.
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

      {/* Cuántas escenas de cada cosa.
          Por defecto lo echa a suertes, que es lo que hace que dos capítulos
          seguidos no salgan calcados. Pero para probar una técnica a fondo hace
          falta poder decirlo: si no, la única forma es generar hasta que el
          dado caiga bien, y cada intento se paga. */}
      {hayVivos && onMezcla && (
        <div className="mt-2 rounded-lg border border-border px-2 py-1.5">
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={!!mezcla}
              onChange={(e) => onMezcla(e.target.checked
                ? { apng: valor.apng ? 2 : 0, paralaje: valor.paralaje ? 1 : 0 }
                : null)}
            />
            <span className="font-medium text-fg">Elegir yo la mezcla</span>
            <span className="text-muted">{mezcla ? "" : "ahora la reparte la app"}</span>
          </label>
          {mezcla && (
            <div className="mt-1.5 grid gap-1.5">
              {valor.apng && (
                <label className="flex items-center gap-2 text-[10px] text-muted">
                  <span className="w-20 shrink-0">Fotos vivas</span>
                  <input
                    type="range" min={0} max={tope} step={1} value={Math.min(mezcla.apng, tope)}
                    onChange={(e) => onMezcla({ ...mezcla, apng: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-4 text-right tabular-nums text-fg">{Math.min(mezcla.apng, tope)}</span>
                </label>
              )}
              {valor.paralaje && (
                <label className="flex items-center gap-2 text-[10px] text-muted">
                  <span className="w-20 shrink-0">En 2.5D</span>
                  <input
                    type="range" min={0} max={Math.min(3, tope)} step={1}
                    value={Math.min(mezcla.paralaje, 3, tope)}
                    onChange={(e) => onMezcla({ ...mezcla, paralaje: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-4 text-right tabular-nums text-fg">{Math.min(mezcla.paralaje, 3, tope)}</span>
                </label>
              )}
              <p className="text-[10px] text-muted">
                El resto salen planas. Elegir CUÁLES escenas sigue siendo cosa de la IA.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
