// Decirle a la IA qué NO dibujar en cada lámina.
//
// EL PROBLEMA, visto en una escena de mercado nocturno: la capa «rascacielos
// borrosos» volvió con rascacielos, y además con la luna, nubes, el agua y sus
// reflejos. Recortada por las siluetas del mapa, quedaban cuatro cuñas con un
// paisaje entero dentro de cada una.
//
// Y era previsible. A cada capa se le manda la descripción COMPLETA de la
// escena —«callejón nocturno con neón, luna baja entre nubes, suelo mojado»—
// para que todas compartan luz y estilo. El modelo la lee y pinta lo que dice,
// porque nadie le había dicho que eso era contexto y no un encargo.
//
// La forma barata de arreglarlo no es pedirlo mejor: es NOMBRAR lo que ya
// sabemos que va en otra capa. El mapa tiene la lista de capas; si a la de los
// rascacielos se le dice «no dibujes: cielo nocturno, suelo mojado, puestos y
// faroles, rama de cerezo», deja de haber sitio para la duda.

/** Cosas que casi nunca son de la capa y se cuelan solas. */
const SIEMPRE_FUERA = [
  "sky", "moon", "stars", "clouds", "sun", "horizon",
  "ground", "floor", "water", "puddles", "reflections",
  "distant scenery", "background landscape",
];

/** Quita el número de orden y los adornos del nombre de una capa. */
export function nombreLimpio(nombre: string): string {
  return nombre
    .replace(/^\s*\d+\s*[-—·.)]?\s*/, "")
    .replace(/\s*·\s*(pieza|resto|zona).*$/i, "")
    .trim();
}

/**
 * Qué NO debe dibujar esta capa.
 *
 * Junta lo que dijera el mapa, las OTRAS capas de la escena y la lista corta de
 * cosas que se cuelan siempre. El fondo es la excepción: es el único que sí
 * pinta cielo, luna y horizonte, y prohibírselo lo dejaría vacío.
 */
export function listaDeExclusion({
  capa,
  otras,
  extra,
  esFondo,
  tope = 1800,
}: {
  capa: string;
  otras: string[];
  extra?: string;
  esFondo?: boolean;
  tope?: number;
}): string {
  if (esFondo) return (extra ?? "").trim();

  const yo = nombreLimpio(capa).toLowerCase();
  const vistos = new Set<string>();
  const partes: string[] = [];
  const meter = (t: string) => {
    const limpio = t.trim().replace(/[.;]+$/, "");
    if (!limpio) return;
    const clave = limpio.toLowerCase();
    // No pedirle que excluya lo que es SU contenido: con «no dibujes
    // rascacielos» en la capa de rascacielos, vuelve vacía.
    if (clave === yo || vistos.has(clave)) return;
    vistos.add(clave);
    partes.push(limpio);
  };

  if (extra) for (const t of extra.split(/[,;\n]/)) meter(t);
  for (const o of otras) {
    const n = nombreLimpio(o);
    // Una capa cuyo nombre contiene al de esta —o al revés— se salta: prohibir
    // «faroles y rama» en la capa «faroles» la dejaría sin faroles.
    const c = n.toLowerCase();
    if (!c || c.includes(yo) || yo.includes(c)) continue;
    meter(n);
  }
  for (const t of SIEMPRE_FUERA) meter(t);

  let fuera = "";
  for (const p of partes) {
    const siguiente = fuera ? `${fuera}, ${p}` : p;
    if (siguiente.length > tope) break;
    fuera = siguiente;
  }
  return fuera;
}
