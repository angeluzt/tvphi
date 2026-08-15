"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

/** Caja de prompt para parchear la pieza seleccionada. */
export function ParcheIa({
  etiqueta,
  ocupado,
  onParche,
}: {
  etiqueta: string;
  ocupado?: boolean;
  onParche: (instruccion: string) => void;
}) {
  const [txt, setTxt] = useState("");
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/5 p-2">
      <span className="text-[11px] font-medium">Arreglar con prompt · {etiqueta}</span>
      <textarea
        className="input mt-1 h-16 w-full text-sm"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        placeholder="El árbol más a la izquierda. Baja la música. Quita el fuego."
        aria-label={`Arreglar ${etiqueta} con un prompt`}
      />
      <button
        type="button"
        className="btn-brand mt-1.5 text-xs disabled:opacity-40"
        disabled={ocupado || txt.trim().length < 2}
        onClick={() => { const t = txt.trim(); if (t.length >= 2) onParche(t); }}
      >
        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Aplicar
      </button>
    </div>
  );
}
