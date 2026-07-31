import { NextResponse } from "next/server";
import { VFX, SHAPE_LABEL, GROUP_LABEL, vfxDefaults } from "@/lib/story/vfx";

// Catálogo de efectos en JSON, para poder escribir un proyecto a mano (o que lo
// genere una IA) sin leerse el motor.
//
// Lo que más falta hacía no son los nombres de los ajustes, sino CÓMO SE
// COMPORTA cada efecto: que el "polvo mágico" flota donde nace y no cruza el
// cuadro, que la ceniza sí cae, que la lámpara no suelta partículas. Sin eso se
// eligen efectos que no hacen lo que su nombre sugiere.

const COMPORTAMIENTO: Record<string, string> = {
  explosion: "Golpe único; con «every» > 0 se repite. Sale del sitio hacia fuera.",
  chispas: "Golpe de chispas con peso: caen tras salir despedidas.",
  destello: "Fogonazo corto en el sitio. No deja partículas.",
  shockwave: "Anillo que se abre desde el sitio. Golpe.",
  escarcha: "Golpe de cristales de hielo que se agarran alrededor del sitio.",
  speedlines: "Líneas que salen del sitio en todas direcciones. Dura dos décimas.",
  glitch: "Bandas digitales sobre un rectángulo centrado en el sitio.",
  magiccircle: "Círculo de runas que gira sobre el sitio y se apaga.",
  fuego: "Llama continua que sube desde el sitio. En línea, arde todo el trazo.",
  aura: "Bola de energía revuelta pegada al sitio. No se desplaza.",
  portal: "Remolino continuo en el sitio. Varios sitios juntos llenan un hueco.",
  luz: "Esfera de luz quieta. Pocas partículas.",
  baliza: "Destellos alternos de policía o ambulancia sobre el sitio.",
  neon: "Tubo de luz a lo largo del trazo. Estático salvo el parpadeo.",
  navidad: "Bombillas repartidas por el trazo.",
  rayo: "Relámpagos. Con forma «arriba» caen por cualquier parte del ancho.",
  lluvia: "Cae y cruza el cuadro entero. Pensada para la forma «arriba».",
  nieve: "Cae despacio y se balancea. Cruza el cuadro.",
  ceniza: "Cae lento. Tarda en llenar la escena; súbele la velocidad si la toma es corta.",
  hojas: "Caen girando, con viento.",
  polvo: "OJO: son luciérnagas. FLOTAN donde nacen, NO cruzan el cuadro. Con la forma «arriba» se reparten por el alto para que llenen la escena.",
  niebla: "Manchas de bruma repartidas por el trazo. Con «arriba» llena la escena entera.",
  humo: "Columna que sube y se abre. Sobre fondo casi negro se lee como una mancha clara: úsalo con poca intensidad.",
  burbujas: "Suben. Ponlas en una línea abajo para que suban desde el suelo.",
  confeti: "Papelitos de colores que caen girando.",
  estrellas: "Brillos que titilan y apenas se mueven. Con «arriba» se reparten por el alto.",
  lampara: "Solo resplandor: NO suelta partículas. Para una ventana, una vela o una farola.",
  haces: "Rayos rectos que salen del sitio como una estrella. Muy marcado: sobre una foto que ya tiene su luz, canta.",
  electricidad: "Chispazos cortos repartidos por el trazo. Cada uno dura poco.",
  fugaces: "Estrellas fugaces inclinadas.",
  corazones: "Suben o caen según «sentido».",
  salpicadura: "Golpe de gotas de agua; con «every» > 0 se repite.",
};

export async function GET() {
  const efectos = VFX.map((v) => ({
    id: v.id,
    nombre: v.label,
    grupo: v.group,
    grupoNombre: GROUP_LABEL[v.group],
    // Si es continuo dura toda su ventana; si no, es un golpe que salta y se apaga.
    continuo: v.continuo,
    comportamiento: COMPORTAMIENTO[v.id] ?? "",
    formas: v.shapes.map((f) => ({ id: f, nombre: SHAPE_LABEL[f] })),
    colorPorDefecto: v.color,
    ajustes: v.params.map((p) => ({
      clave: p.key, nombre: p.label, min: p.min, max: p.max, paso: p.step,
    })),
    porDefecto: vfxDefaults(v.id),
  }));

  return NextResponse.json({
    // Cómo se escriben los sitios de un efecto, que es donde más se falla.
    sitios: {
      espacio: {
        encuadre: "0..1 sobre el ENCUADRE INICIAL de la toma. Es lo que sale al colocarlos con el dedo. Por defecto.",
        imagen: "0..1 sobre la IMAGEN entera, sin importar el encuadre. Lo cómodo al escribir el proyecto a mano.",
      },
      forma: {
        arriba: "Franja a todo el ancho por encima del cuadro. Sus sitios los pone el motor: lo que escribas se ignora.",
        punto: "Un sitio suelto: {x, y, x2: x, y2: y}.",
        linea: "Un trazo de (x, y) a (x2, y2). El efecto se reparte por él.",
        libre: "Varios trazos seguidos, como dibujados a mano.",
      },
      follow: "Si el efecto va pegado a algo de la foto, tiene que seguir a la cámara o se queda flotando al hacer zoom. Si no lo pones, se decide por el tipo de efecto.",
    },
    efectos,
  });
}
