import { MOV_COLA, ejeDelMov, segundosPosibles } from "@/lib/lab/anim-paralaje";
import { catalogoCompacto } from "@/lib/story/catalogo";

// Lo que hay que contarle al modelo para que sepa animar esta escena.
//
// Se GENERA desde las mismas listas que usa el motor, no se escribe a mano. Un
// texto copiado se queda viejo en cuanto alguien añade un movimiento, y el
// modelo empieza a recibir un catálogo que no existe —que es exactamente cómo
// se acaba con animaciones que la aplicación no sabe reproducir—.

/** Los movimientos, con su eje y con qué combinan. */
export function movimientosParaIA() {
  return MOV_COLA.map((m) => ({
    mov: m.id,
    hace: m.pista,
    eje: ejeDelMov(m.id),
    combinaCon: segundosPosibles(m.id),
  }));
}

/**
 * Las reglas que se rompen si no se dicen.
 *
 * Cada una está aquí porque se rompió: son las que convierten una animación
 * correcta sobre el papel en una que se ve mal.
 */
export function reglasCamara() {
  return [
    "La cámara ARRASTRA la escena, no la recorta: al acercarse, las capas con más «depth» crecen mucho más que el fondo. Eso es el paralaje, y es todo el sentido de trabajar por capas.",
    "«depth» va de 0 (infinito, no se mueve) a 1 (pegado a la cámara). El fondo cerca de 0.05; el plano medio sobre 0.35; lo que está al alcance de la mano, 0.8 o más.",
    "Cada paso ARRANCA DONDE ACABÓ EL ANTERIOR («desde»: «continuar»). Es lo que permite acercarse, luego panear desde ahí, y luego atravesar. Usa «centro» solo si quieres volver al plano general de golpe.",
    "«mov2» hace dos cosas A LA VEZ en el mismo tramo, y tiene que ser de OTRO eje: subir mientras te acercas, ir a la izquierda mientras bajas. Dos del mismo eje se anulan.",
    "«atravesar» cruza la capa de delante: se acerca hasta pasarla y la desvanece para revelar lo de detrás. Necesita AL MENOS DOS capas y que la de delante tenga depth alto; si no, no hay nada que cruzar.",
    "Una capa que ya se ha atravesado sigue oculta en los pasos siguientes. No la vuelvas a desvanecer.",
    "La «intensidad» (0–100) es cuánto se mueve, no cómo de rápido: la velocidad sale de repartir esa distancia entre los segundos. Mucha intensidad en poco tiempo marea.",
    "Un plano quieto entre dos movimientos respira: «esperar» un segundo antes de arrancar hace que lo siguiente se lea.",
    "No encadenes más de cinco o seis pasos: una escena es un momento, no un recorrido turístico.",
  ];
}

/** Cómo se escribe la animación. */
export function formaAnimacion() {
  return {
    animacion: {
      pasos: [
        { mov: "acercar", segundos: 3, intensidad: 45, nota: "entramos al patio" },
        { mov: "arriba", mov2: "acercar", segundos: 2.5, intensidad: 35, nota: "subimos la mirada al arco" },
        { mov: "atravesar", segundos: 3, intensidad: 70, capa: "frente", fade: "desaparecer", nota: "cruzamos el arco" },
        { mov: "esperar", segundos: 1, nota: "la luna, quieta" },
      ],
    },
  };
}

/** Los efectos del motor que se pueden colgar de la escena. */
export function efectosParaIA() {
  return catalogoCompacto();
}

export function reglasEfectos() {
  return [
    "Los efectos van en «efectos», con coordenadas 0..1 sobre el mapa de la escena, igual que las formas.",
    "Un efecto pegado a un sitio —fuego, humo, un portal, una lámpara— usa «espacio»:«imagen» y crece al acercarte, como si estuviera de verdad ahí.",
    "La lluvia, la nieve y la niebla usan forma «arriba»: llenan la pantalla y NO cambian al acercarse, que es lo que se espera del clima.",
    "Si pones un efecto donde hay una «vfx_zone» en el mapa, hazlo coincidir con ella: esa zona está reservada justo para eso y la capa no se dibujará ahí.",
    "Solo los «id» del catálogo. Un efecto inventado no se pinta.",
  ];
}

/** Todo junto, para meter en el prompt. */
export function referenciaAnimacion() {
  return {
    movimientos: movimientosParaIA(),
    reglasCamara: reglasCamara(),
    forma: formaAnimacion(),
    efectos: efectosParaIA(),
    reglasEfectos: reglasEfectos(),
  };
}
