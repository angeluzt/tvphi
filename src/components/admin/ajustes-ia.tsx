"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, AlertTriangle, Sliders } from "lucide-react";
import { CALIDADES, PRECIO_IMAGEN, type AjustesIa, type CalidadImagen } from "@/lib/story/ajustes";

// Los mandos del gasto.
//
// Cada opción dice lo que cuesta al lado, porque la decisión es económica y sin
// el número al lado no se puede tomar: «media» no significa nada, «8× más cara
// que la baja» sí.

export function AjustesIaForm({ inicial }: { inicial: AjustesIa }) {
  const [a, setA] = useState<AjustesIa>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);

  useEffect(() => { setA(inicial); }, [inicial]);

  const set = <K extends keyof AjustesIa>(k: K, v: AjustesIa[K]) => {
    setA((x) => ({ ...x, [k]: v })); setSucio(true); setAviso(null); setError(null);
  };

  async function guardar() {
    setGuardando(true); setError(null); setAviso(null);
    try {
      const r = await fetch("/api/admin/ajustes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo guardar");
      setA(j.ajustes); setSucio(false);
      setAviso("Guardado. Se aplica a partir de la siguiente generación.");
    } catch (e) { setError((e as Error).message); }
    setGuardando(false);
  }

  // Lo que costaría un capítulo de 6 escenas con lo que hay puesto.
  const porCapitulo = 6 * PRECIO_IMAGEN[a.calidadImagen];
  const alDia = a.imagenesPorDia * PRECIO_IMAGEN[a.calidadImagen];

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Sliders className="h-4 w-4 shrink-0 text-accent" />
        <span className="label flex-1">Qué se deja gastar al usuario normal</span>
        {sucio && <span className="chip bg-gold/15 text-gold">sin guardar</span>}
      </div>
      <p className="text-[11px] text-muted">
        Esto NO te afecta a ti: como administrador puedes elegir calidad y no tienes
        cupo. Es el techo de gasto de los demás, y lo aplica el servidor.
      </p>

      <div>
        <span className="text-xs text-fg">Calidad de las imágenes</span>
        <div className="mt-1 grid grid-cols-3 gap-1">
          {CALIDADES.map((c) => (
            <button
              key={c.id} type="button"
              onClick={() => set("calidadImagen", c.id as CalidadImagen)}
              className={`rounded-lg border px-2 py-2 text-left text-[10px] leading-tight ${
                a.calidadImagen === c.id
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted hover:border-brand/60 hover:text-fg"
              }`}
            >
              <span className="block text-[11px] font-medium">{c.label}</span>
              <span className="block">{c.pista}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted">
          En <b className="text-fg">baja</b> no se manda la referencia de efectos: su entrada se
          cobra a fidelidad alta pase lo que pase, así que pagarla para un borrador es tirar el
          dinero. Los efectos se siguen viendo en el vídeo —los pinta TVPHI—, solo que el fondo
          no se genera pensando en ellos.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Numero
          etiqueta="Imágenes con IA por día" valor={a.imagenesPorDia} min={0} max={500}
          onCambio={(v) => set("imagenesPorDia", v)}
          pista={`≈ $${alDia.toFixed(3)} por usuario y día como mucho`}
        />
        <Numero
          etiqueta="Historias con IA por día" valor={a.historiasPorDia} min={0} max={100}
          onCambio={(v) => set("historiasPorDia", v)}
          pista="0 = interruptor de emergencia: apaga toda la IA de pago"
        />
        <Numero
          etiqueta="Voces de pago por día" valor={a.vocesPorDia} min={0} max={500}
          onCambio={(v) => set("vocesPorDia", v)}
          pista="Solo cuenta si la narración de pago está encendida"
        />
        <Numero
          etiqueta="Reescrituras de texto por día" valor={a.textosPorDia} min={0} max={500}
          onCambio={(v) => set("textosPorDia", v)}
          pista="«Rehacer» frase o prompt; no regenerar el capítulo entero"
        />
      </div>

      <Interruptor
        etiqueta="Narración con voz de pago"
        puesto={a.vozDePago}
        onCambio={(v) => set("vozDePago", v)}
        cuandoNo="Apagado: narran con el modelo del navegador. Gratis, suena más robótico."
        cuandoSi="Encendido: narran con OpenAI. Suena mucho mejor y se paga por minuto."
      />
      <Interruptor
        etiqueta="Generar imágenes con IA"
        puesto={a.imagenesIa}
        onCambio={(v) => set("imagenesIa", v)}
        cuandoNo="Apagado: solo pueden subir sus propias imágenes. Coste cero."
        cuandoSi="Encendido: pueden generarlas, con la calidad y el cupo de arriba."
      />

      <Interruptor
        etiqueta="Paralaje 2.5D en historias"
        puesto={a.paralaje25d}
        onCambio={(v) => set("paralaje25d", v)}
        cuandoNo="Apagado: el editor de historias se queda exactamente como está."
        cuandoSi="Encendido: cada escena puede partirse en láminas con profundidad y editarse en una ventana aparte, como en el laboratorio."
      />

      <div className="rounded-lg border border-border bg-surface-2/50 p-2 text-[11px] text-muted">
        Con lo puesto, un capítulo de 6 escenas le cuesta{" "}
        <b className="tabular-nums text-fg">${porCapitulo.toFixed(3)}</b> en imágenes
        {a.vozDePago ? ", más la voz" : ", y la voz sale gratis"}.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void guardar()} disabled={guardando || !sucio} className="btn-brand text-xs disabled:opacity-40">
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Guardar
        </button>
        {aviso && <span className="text-[11px] text-accent">{aviso}</span>}
        {error && (
          <span className="flex items-center gap-1 text-[11px] text-danger">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </span>
        )}
      </div>
    </div>
  );
}

function Numero({ etiqueta, valor, min, max, onCambio, pista }: {
  etiqueta: string; valor: number; min: number; max: number;
  onCambio: (v: number) => void; pista?: string;
}) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <label className="text-xs text-fg">
      {etiqueta}
      <input
        type="text" inputMode="numeric"
        value={txt ?? String(valor)}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) {
            onCambio(Math.max(min, Math.min(max, Math.floor(n))));
          }
        }}
        onBlur={() => setTxt(null)}
        className="input mt-1 w-full py-1 text-sm tabular-nums"
      />
      {pista && <span className="mt-0.5 block text-[10px] text-muted">{pista}</span>}
    </label>
  );
}

function Interruptor({ etiqueta, puesto, onCambio, cuandoSi, cuandoNo }: {
  etiqueta: string; puesto: boolean; onCambio: (v: boolean) => void;
  cuandoSi: string; cuandoNo: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface-2/40 p-2">
      <input
        type="checkbox" checked={puesto} onChange={(e) => onCambio(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-fg">{etiqueta}</span>
        <span className="block text-[10px] text-muted">{puesto ? cuandoSi : cuandoNo}</span>
      </span>
    </label>
  );
}
