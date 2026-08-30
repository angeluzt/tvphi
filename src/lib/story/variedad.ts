import { VFX, GROUP_LABEL, type VfxGroup } from "./vfx";
import { SONIDOS, PISTAS, FAMILIA_LABEL, type FamiliaSonido } from "./musica";
import { aleatorio } from "./reparto-medios";

// Que dos capítulos seguidos no salgan iguales.
//
// EL PROBLEMA, MEDIDO A OJO PERO REAL. El catálogo se le manda al modelo
// siempre en el mismo orden: explosión, chispas, destello… y lluvia y niebla
// bastante arriba. Un modelo lee una lista larga y tira de lo primero que
// encaja, así que salían los mismos cuatro efectos una y otra vez, y los mismos
// tres sonidos. No es que el catálogo sea corto —hay treinta y tantos efectos y
// más de cincuenta sonidos—: es que solo se usaba su principio.
//
// LO QUE SE HACE. Dos cosas, las dos baratas:
//   · BARAJAR el catálogo en cada generación. No cuesta un token de más y quita
//     el sesgo de orden de un plumazo.
//   · SUGERIR de verdad. Se sacan a sorteo unas familias y unos cuantos ids
//     concretos «para esta tanda», y se le dice que empiece por ahí. Una lista
//     corta y distinta cada vez se usa; una lista larga y siempre igual, no.
//
// Lo que NO se hace: obligar. Si la historia pide lluvia y la lluvia no salió
// sorteada, que ponga lluvia. Esto mueve el punto de partida, no ata las manos.

/** Baraja una copia. Fisher-Yates con el dado sembrado, para poder probarlo. */
export function barajar<T>(lista: readonly T[], dado: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(dado() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface SugerenciasTanda {
  /** Familias de efectos por las que empezar a mirar. */
  gruposVfx: VfxGroup[];
  /** Ids concretos de efectos, ya sorteados. */
  efectos: string[];
  /** Familias de sonidos. */
  familiasSonido: FamiliaSonido[];
  /** Ids de sonidos: unos cuantos golpes y unos cuantos ambientes. */
  golpes: string[];
  ambientes: string[];
  /** Un par de pistas de música por las que empezar. */
  musica: string[];
}

/**
 * El menú de esta tanda.
 *
 * Se cogen DOS familias de efectos y DOS de sonidos, no una: con una sola el
 * capítulo entero suena y se ve del mismo palo, que es el defecto contrario al
 * que se venía a arreglar.
 */
export function sugerenciasDeTanda(semilla: number): SugerenciasTanda {
  const dado = aleatorio(semilla);

  const grupos = barajar([...new Set(VFX.map((v) => v.group))], dado).slice(0, 2);
  const efectos = barajar(VFX.filter((v) => grupos.includes(v.group)), dado)
    .slice(0, 6).map((v) => v.id);

  const familias = barajar([...new Set(SONIDOS.map((s) => s.familia))], dado).slice(0, 2);
  const deFamilia = SONIDOS.filter((s) => familias.includes(s.familia));
  const golpes = barajar(deFamilia.filter((s) => !s.bucle), dado).slice(0, 4).map((s) => s.id);
  // Los ambientes se sacan del catálogo entero: hay pocos en bucle y limitarlos
  // a las dos familias sorteadas deja capítulos sin ninguno.
  const ambientes = barajar(SONIDOS.filter((s) => s.bucle), dado).slice(0, 4).map((s) => s.id);
  const musica = barajar(PISTAS, dado).slice(0, 4).map((p) => p.id);

  return { gruposVfx: grupos, efectos, familiasSonido: familias, golpes, ambientes, musica };
}

/** El texto que se le manda. Corto: una lista larga vuelve a no leerse. */
export function instruccionesVariedad(s: SugerenciasTanda, conVfx: boolean, conMusica: boolean): string {
  const lineas: string[] = [
    "VARIEDAD DE ESTA TANDA (esto cambia en cada generación; es tu punto de partida, no una jaula):",
  ];
  if (conVfx) {
    lineas.push(
      `· Efectos: tira primero de ${s.gruposVfx.map((g) => GROUP_LABEL[g]).join(" y ")} — por ejemplo ${s.efectos.join(", ")}.`,
      "· No repitas el mismo efecto en más de dos escenas, y no pongas lluvia o niebla por costumbre: si no aporta, no lo pongas.",
      "· Que no todas las escenas lleven efecto. Una escena limpia hace que la siguiente con efecto se note.",
    );
  }
  lineas.push(
    `· Sonidos: mira ${s.familiasSonido.map((f) => FAMILIA_LABEL[f]).join(" y ")}. Golpes sugeridos: ${s.golpes.join(", ")}. Ambientes: ${s.ambientes.join(", ")}.`,
    "· Usa sonidos DISTINTOS entre escenas y mezcla golpe puntual con ambiente en bucle; repetir el mismo golpe tres veces suena a error, no a estilo.",
  );
  if (conMusica) {
    lineas.push(`· Música: empieza mirando ${s.musica.join(", ")}, y solo si de verdad pega con el tono.`);
  }
  lineas.push(
    "· Tampoco repitas el mismo encuadre: alterna plano abierto, primer plano, paneo y un plano mudo corto.",
  );
  return lineas.join("\n");
}

/**
 * El catálogo de efectos, barajado.
 *
 * Se le pasa el mismo contenido de siempre en otro orden. El modelo deja de
 * leer siempre «explosión» la primera y el reparto se abre solo.
 */
export function barajarCatalogo<T>(lista: T[], semilla: number): T[] {
  return barajar(lista, aleatorio(semilla ^ 0x9e3779b9));
}
