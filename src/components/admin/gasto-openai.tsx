"use client";

import { useEffect, useState } from "react";
import { DollarSign, Loader2, RefreshCw, Copy, Check, AlertTriangle, Info } from "lucide-react";

// Lo gastado en OpenAI, en pantalla.
//
// El saldo restante NO se enseña como si se supiera: OpenAI no lo publica. Se
// dice, y si hay presupuesto propio configurado se resta de ahí, dejando claro
// que la referencia es ese presupuesto y no la cuenta de OpenAI.

interface Gasto {
  desde: string; hasta: string; huso: string;
  totalUsd: number; hoyUsd: number; mesUsd: number; moneda: string;
  porDia: { dia: string; usd: number }[];
  porConcepto: { concepto: string; usd: number }[];
  presupuestoUsd: number | null;
  quedaUsd: number | null;
  nota: string;
}

const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : "$0";

export function GastoOpenAi() {
  const [dias, setDias] = useState(30);
  const [dato, setDato] = useState<Gasto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function cargar(d = dias) {
    setCargando(true); setError(null);
    try {
      const r = await fetch(`/api/admin/gasto?dias=${d}`);
      // Se lee como texto y se intenta pasar a JSON, en vez de fiarse.
      // Si algo por el camino contesta una página de error —el servidor, un
      // proxy, un tiempo agotado—, `r.json()` reventaba con «Unexpected token
      // '<'» y eso era todo lo que se llegaba a saber del fallo.
      const txt = await r.text();
      let j: any = null;
      try { j = JSON.parse(txt); } catch { j = null; }
      if (!j) {
        throw new Error(
          r.ok
            ? "El servidor contestó algo que no es JSON."
            : `El servidor contestó ${r.status}${r.statusText ? ` (${r.statusText})` : ""}`
              + " con una página en vez de datos. Suele ser que la petición tardó demasiado.",
        );
      }
      if (!r.ok) throw new Error(j.error || "No se pudo leer el gasto");
      setDato(j);
    } catch (e) { setError((e as Error).message); setDato(null); }
    setCargando(false);
  }
  useEffect(() => { void cargar(30); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function copiar() {
    if (!dato) return;
    await navigator.clipboard.writeText(JSON.stringify(dato, null, 2));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  const tope = Math.max(...(dato?.porDia.map((d) => d.usd) ?? [0]), 0.000001);
  // El día más reciente con gasto apuntado. `porDia` viene en orden.
  const ultimoConDatos = dato?.porDia.filter((d) => d.usd > 0).at(-1)?.dia ?? null;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <DollarSign className="h-4 w-4 shrink-0 text-accent" />
        <span className="label flex-1">Gasto en OpenAI</span>
        <select
          value={dias}
          onChange={(e) => { const d = Number(e.target.value); setDias(d); void cargar(d); }}
          className="input py-1 text-[11px]"
          aria-label="Días a consultar"
          disabled={cargando}
        >
          {[7, 30, 60, 90].map((d) => <option key={d} value={d}>{d} días</option>)}
        </select>
        <button onClick={() => void cargar()} disabled={cargando} className="btn-ghost text-xs">
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 text-accent" />}
          Actualizar
        </button>
        {dato && (
          <button onClick={() => void copiar()} className="btn-ghost text-xs">
            {copiado ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5 text-accent" />}
            {copiado ? "Copiado" : "Copiar JSON"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-danger/40 bg-danger/5 p-2 text-[11px] text-danger">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {dato && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cifra
              etiqueta={`Hoy (${dato.huso || "UTC"})`}
              valor={usd(dato.hoyUsd)}
              // «Hoy: $0» no dice si es que no has gastado o si OpenAI aún no
              // lo ha publicado —tarda—. Enseñando hasta cuándo hay datos, se
              // distingue de un vistazo y se deja de parecer un fallo.
              pista={dato.hoyUsd === 0 && ultimoConDatos
                ? `último dato: ${fecha(ultimoConDatos)}`
                : undefined}
            />
            <Cifra etiqueta="Este mes" valor={usd(dato.mesUsd)} />
            <Cifra etiqueta={`Últimos ${dias} días`} valor={usd(dato.totalUsd)} />
            <Cifra
              etiqueta={dato.presupuestoUsd === null ? "Queda" : `De tu presupuesto (${usd(dato.presupuestoUsd)})`}
              valor={dato.quedaUsd === null ? "—" : usd(dato.quedaUsd)}
              flojo={dato.quedaUsd === null}
            />
          </div>

          <p className="mt-2 flex items-start gap-1.5 text-[10px] text-muted">
            <Info className="mt-px h-3 w-3 shrink-0" /> {dato.nota}
          </p>

          {!!dato.porDia.length && (
            <div className="mt-3">
              <span className="text-[11px] text-muted">Por día</span>
              <div className="mt-1 flex h-16 items-end gap-px">
                {dato.porDia.map((d) => (
                  <span
                    key={d.dia}
                    title={`${d.dia} · ${usd(d.usd)}`}
                    style={{ height: `${Math.max(2, (d.usd / tope) * 100)}%` }}
                    className="min-w-[3px] flex-1 rounded-sm bg-accent/60 hover:bg-accent"
                  />
                ))}
              </div>
              <div className="mt-0.5 flex justify-between text-[9px] text-muted">
                <span>{dato.desde}</span><span>{dato.hasta}</span>
              </div>
            </div>
          )}

          {!!dato.porConcepto.length && (
            <div className="mt-3">
              <span className="text-[11px] text-muted">En qué se fue</span>
              <ul className="mt-1 space-y-1">
                {dato.porConcepto.slice(0, 8).map((c) => (
                  <li key={c.concepto} className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-fg">{c.concepto}</span>
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full bg-accent"
                        style={{ width: `${Math.min(100, (c.usd / (dato.totalUsd || 1)) * 100)}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-muted">{usd(c.usd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-muted hover:text-fg">
              Ver el JSON
            </summary>
            <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-surface-2/50 p-2 text-[10px] leading-relaxed">
{JSON.stringify(dato, null, 2)}
            </pre>
          </details>
        </>
      )}

      {!dato && !error && !cargando && (
        <p className="mt-3 text-[11px] text-muted">Sin datos todavía.</p>
      )}
    </div>
  );
}

/** AAAA-MM-DD → «7 ago», que es como se lee una fecha. */
function fecha(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return new Date(Date.UTC(a, m - 1, d))
    .toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "UTC" });
}

function Cifra({ etiqueta, valor, flojo, pista }: {
  etiqueta: string; valor: string; flojo?: boolean; pista?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-2">
      <div className="text-[10px] text-muted">{etiqueta}</div>
      <div className={`text-base font-semibold tabular-nums ${flojo ? "text-muted" : "text-fg"}`}>{valor}</div>
      {pista && <div className="text-[9px] leading-tight text-muted">{pista}</div>}
    </div>
  );
}
