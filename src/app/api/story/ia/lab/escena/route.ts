import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { claveOpenAi, preferenciasModelos, OPENAI, IA_NO_DISPONIBLE, espera, motivoFallo } from "@/lib/story/credenciales";
import { anotarFallo } from "@/lib/story/fallidos";
import { esAdminHistorias, bloqueoDeGasto, respuestaBloqueo } from "@/lib/story/cupo";
import { revisar } from "@/lib/lab/escena";
import { leerAnimacion } from "@/lib/lab/animacion-ia";
import { referenciaAnimacion } from "@/lib/lab/referencia-camara";
import { movimientosCapaParaIA, reglasMovimientoCapa } from "@/lib/lab/movimiento-capa";
import { rutasSpriteParaIA } from "@/lib/lab/sprite-capa";
import { leerSpritesPlaneados } from "@/lib/lab/plan-escena-viva";
import type { SpriteMeta } from "@/lib/lab/biblioteca";

// De una frase a un mapa de la escena por capas.
//
// El modelo de texto no dibuja: coloca. Se le pide el JSON con la geometría
// —qué hay, dónde, en qué capa y a qué profundidad— y luego cada capa se pinta
// aparte. Es lo que hace que la escena tenga sitios conocidos: se sabe dónde
// quedó el arco porque se decidió antes de dibujar nada.
//
// En pruebas y solo para admin, como el resto del laboratorio.

const cuerpo = z.object({
  // 4000, igual que el resto de rutas de IA que ya funcionaban. Con 1200 una
  // descripción normal de escena —fondo, plano medio, escenario, objetos— se
  // pasaba de largo y salía «Datos inválidos» sin decir por qué.
  idea: z.string().min(4).max(4000),
  formato: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  capas: z.number().int().min(3).max(6).default(4),
  /** Activa al director que además elige/genera actores y escribe sus rutas. */
  viva: z.boolean().default(false),
  modelo: z.string().max(80).optional(),
});

const TAM: Record<string, [number, number]> = {
  "16:9": [1536, 1024],
  "9:16": [1024, 1536],
  "1:1": [1024, 1024],
};

const INSTRUCCION = `Eres un director de arte que prepara escenas por capas para animarlas con paralaje.

Devuelves SOLO un objeto JSON, sin explicaciones y sin markdown.

Estructura:
{"scene":{"id":"kebab-case","title":"...","width":N,"height":N,"description":"qué se ve, en una frase","style":"estilo visual en inglés, sin texto ni letras"},
 "layers":[{"id":"kebab","name":"01 Nombre","depth":0.05,"blur":0.3,
   "ai":{"prompt":"lo que hay que DIBUJAR en esta capa, en inglés","exclude":"lo que NO, en inglés"},
   "mov":{"tipo":"deriva","x":0.2,"bucle":true},
   "objects":[{"id":"x","shape":"rect","semantic":"sky","x":0,"y":0,"w":1,"h":1,"label":"CIELO"}]}],
 "animacion":{"pasos":[{"mov":"acercar","segundos":3,"intensidad":45,"nota":"para qué es este tramo"}]},
 "efectos":[{"id":"humo","espacio":"imagen","x":0.5,"y":0.7,"escala":0.4}]}

CAPAS QUE SE MUEVEN SOLAS (esto es lo que hace que la escena esté viva)
- Una capa puede llevar «mov» y moverse por su cuenta, además de moverse con la cámara.
- Si en la escena hay algo que debería estar EN MOVIMIENTO —un pájaro, un barco, una nube, un meteoro, una bandera— dale su PROPIA capa, con el resto del cuadro vacío, y ponle «mov».
- EXCEPCIÓN: si está activo el MODO DIRECTOR DE ESCENA VIVA, los seres u objetos cuya pose cambia van en "sprites" y NO en una capa dibujada. «mov» queda para superficies o decoración que se desplazan como una imagen plana.
- Los tipos, sus campos y las velocidades que funcionan van en la referencia. No inventes otros.
- El fondo y el suelo NUNCA llevan «mov»: si se despegan se ve el borde.

LA ANIMACIÓN Y LOS EFECTOS
- Además del mapa, escribes la ANIMACIÓN de cámara en «animacion.pasos» y los EFECTOS del motor en «efectos».
- Los movimientos válidos, con qué hace cada uno y con cuáles se combinan, van en la referencia que se te pasa aparte. NO inventes ninguno.
- Tú dices QUÉ pasa —«acércate», «cruza el arco»—; los números de cámara los pone la aplicación. No escribas coordenadas de cámara.
- La animación tiene que aprovechar las capas que acabas de crear: si haces una puerta en primer plano, atraviésala.

REGLAS DE LAS CAPAS
- De atrás hacia delante. La PRIMERA es el fondo: cubre el cuadro entero y es opaca.
- Las demás llevan solo lo suyo y van sobre fondo transparente.
- "depth" reparte la profundidad: la del fondo cerca de 0.05, la de delante cerca de 0.95.
- Nunca pongas en una capa que no sea la primera una forma que cubra todo el cuadro:
  esa capa saldría sin transparencia y taparía las de atrás. Lo que ocupa todo se
  cuenta con palabras en "ai.prompt".
- Una capa aparte, casi al frente, para RESERVAS: dónde irá el personaje (semantic
  "subject") y dónde irán los efectos animados (semantic "vfx_zone"). Esa capa es una
  guía: lleva "guia": true, su "ai.prompt" dice que no se dibuja nada, NO se manda a
  dibujar y NO cuenta en el número de capas que se te pide. Es una sola, y solo si
  hace falta reservar sitio.
- Todas las DEMÁS capas se dibujan y cada una cuesta una imagen: no metas ninguna
  que vaya a salir vacía.

COORDENADAS de 0 a 1 sobre el ancho y el alto. Se puede salir un poco (-0.05, 1.05).

semantic: sky, terrain, wall, floor, door, window, column, arch, stairs, vegetation,
water, subject, prop, light_anchor, vfx_zone, negative_space.

shape y lo que lleva cada una:
- rect / roundedRect: x,y,w,h (+radius)
- circle: cx,cy,r · ellipse: cx,cy,rx,ry
- triangle / wedge: x,y,w,h   (wedge sube de izquierda a derecha)
- polygon: points [[x,y],...] · path: points + smooth 0..1 + closed
- line: x1,y1,x2,y2,width
- arch: x,y,w,h,thickness · stairs: x,y,w,h,steps
- door: x,y,w,h,arco · window: x,y,w,h,columnas,filas
- tree: x,y,w,h,tronco · cloud: x,y,w,h · star: cx,cy,r,puntas,hueco
- repeat: x1,y1,x2,y2,veces,item — reparte N copias de "item" por esa línea.
  El item lleva shape, semantic y su tamaño (w,h o r), NO su posición.

"label" en MAYÚSCULAS y corto: es lo que leerá el modelo de imagen.
Usa "repeat" cuando algo se repite (ventanas, columnas, farolas, árboles):
escribir doce objetos iguales ensucia el mapa.`;

const INSTRUCCION_VIVA = `MODO DIRECTOR DE ESCENA VIVA
Además de scene, layers, animacion y efectos, devuelve "sprites": una lista de actores animados.

Cada sprite tiene exactamente esta forma:
{"id":"kebab","nombre":"nombre corto","bibliotecaId":"id exacto o ausente","que":"descripción visual completa en inglés, máximo 400 caracteres","vista":"lateral|frontal|trasera|superior|libre","forma":"tira|columna","fotogramas":6,"fps":10,"despuesDe":"id de una capa dibujable","depth":0.55,"x":-0.15,"y":0.65,"alto":0.18,"espacio":"pantalla","sincronizar":true,"espejo":false,"ruta":{"bucle":false,"pasos":[{"tipo":"mover","x":1.15,"y":0.65,"segundos":5}]}}

REGLAS DEL DIRECTOR
- Un sprite es algo cuya POSE cambia: personas, animales, vehículos, humo vivo, fuego, meteoros. La decoración quieta sigue siendo una capa.
- NO dibujes esos actores dentro de las capas. Reserva su sitio con objetos subject/vfx_zone en una única capa guía.
- Reutiliza un sprite del CATÁLOGO solo si coincide de verdad con personaje, vista y estilo. Copia su bibliotecaId EXACTO. Si no coincide, omite bibliotecaId y describe uno nuevo en "que".
- "que" debe conservar el mismo estilo, paleta, iluminación y ángulo de cámara de la escena. No pidas fondo, texto, marco, suelo ni sombra.
- Máximo 6 sprites; normalmente 1 a 4 dan una escena más legible.
- La posición y cada destino son coordenadas del lienzo: (0,0) arriba a la izquierda, (1,1) abajo a la derecha. Pueden empezar o terminar un poco fuera.
- "despuesDe" es el id de la ÚLTIMA capa que queda detrás del sprite. La aplicación inserta al actor inmediatamente después. Para ocultarlo tras una columna de primer plano, usa el id de la capa anterior a esa columna, NO el id de la propia columna. No pongas todo al frente.
- Usa "pantalla" para trayectorias absolutas que no deben deformarse con paneos/transiciones. Usa "capa" solo cuando el actor esté pegado físicamente al decorado y deba heredar paralaje y zoom.
- Una ruta puede encadenar mover, pausa y voltear. Para ir, girar y volver: mover, pausa opcional, voltear, mover. Usa bucle solo si debe repetirse.
- El fotograma interno y la ruta espacial son cosas distintas: fotogramas/fps animan patas o alas; ruta mueve el actor por la escena.
- Para movimiento horizontal usa vista lateral y espejo/voltear. Para avanzar hacia cámara usa frontal; alejarse usa trasera; para movimiento cenital usa superior. Objetos que giran o caen libremente pueden usar libre.
- Coordina duración de rutas y pasos de cámara para que haya una pequeña historia visual, no movimientos aleatorios.
- Si la petición no necesita actores animados, devuelve "sprites": [].`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // El laboratorio es solo para quien administra, igual que su página.
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const sinCupo = await bloqueoDeGasto(user);
  if (sinCupo) return respuestaBloqueo(sinCupo);

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // QUÉ está mal, no solo que algo lo está. «Datos inválidos» a secas obliga
    // a adivinar, y aquí lo que suele fallar es un texto demasiado largo.
    const detalle = parsed.error.issues
      .map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`)
      .join(" · ");
    return NextResponse.json({ error: `Datos inválidos — ${detalle}` }, { status: 400 });
  }

  const key = claveOpenAi();
  if (!key) return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });

  const guardados = await preferenciasModelos(user.id, user.email);
  const modelo = parsed.data.modelo || guardados.texto;
  const [w, h] = TAM[parsed.data.formato];

  // Solo se manda texto y metadatos. Las tiras PNG pesan mucho y el modelo no
  // necesita verlas para saber que ya existe «ratón mecánico, vista lateral».
  let catalogo: SpriteMeta[] = [];
  if (parsed.data.viva) {
    const filas = await prisma.sprite.findMany({
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        id: true, nombre: true, que: true, fotogramas: true, fps: true,
        ancho: true, alto: true, bytes: true, createdAt: true,
      },
    });
    catalogo = filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      que: f.que,
      fotogramas: f.fotogramas,
      fps: f.fps,
      ancho: f.ancho,
      alto: f.alto,
      bytes: f.bytes,
      creadoEn: f.createdAt.toISOString(),
    }));
  }

  try {
    const r = await fetch(OPENAI("/v1/chat/completions"), {
        signal: espera("texto"),
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: modelo,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCCION },
          ...(parsed.data.viva ? [{ role: "system", content: INSTRUCCION_VIVA }] : []),
          // La referencia se genera desde las mismas listas que usa el motor:
          // sin ella el modelo inventa movimientos y efectos que la aplicación
          // no sabe reproducir, y el fallo solo se ve al darle a reproducir.
          { role: "system", content:
            "REFERENCIA DE CÁMARA Y EFECTOS (no inventes nada fuera de esto):\n"
            + JSON.stringify(referenciaAnimacion()) },
          { role: "system", content:
            "CAPAS QUE SE MUEVEN SOLAS:\n"
            + JSON.stringify({
                tipos: movimientosCapaParaIA(),
                reglas: reglasMovimientoCapa(),
              }) },
          ...(parsed.data.viva ? [
            { role: "system", content:
              "RUTAS VÁLIDAS DE SPRITES (usa únicamente este contrato):\n"
              + JSON.stringify(rutasSpriteParaIA()) },
            { role: "system", content:
              "CATÁLOGO REUTILIZABLE. Usa únicamente ids de esta lista; si nada coincide, genera uno nuevo:\n"
              + JSON.stringify(catalogo.map((s) => ({
                id: s.id, nombre: s.nombre, que: s.que.slice(0, 220),
                fotogramas: s.fotogramas, fps: s.fps,
              }))) },
          ] : []),
          { role: "user", content:
            `Escena: ${parsed.data.idea}\n\n`
            + `Lienzo: ${w}x${h}. Haz exactamente ${parsed.data.capas} capas que se DIBUJEN. `
            + "La de reservas, si la pones, va aparte y no cuenta en ese número." },
        ],
      }),
    });
    // Se lee como texto primero: con un proxy por medio la respuesta puede no
    // ser JSON, y entonces reventaría aquí con un error ilegible.
    const txt = await r.text();
    let j: any = null;
    try { j = JSON.parse(txt); } catch {}
    if (!r.ok) {
      const crudo = j?.error?.message || `OpenAI respondió ${r.status}`;
      const delModelo = /deprecat|does not exist|no longer|not found|unsupported|model/i.test(crudo);
      if (delModelo) await anotarFallo(user.id, modelo);
      return NextResponse.json({ error: crudo, modeloMal: delModelo, modelo }, { status: 502 });
    }
    if (!j) {
      return NextResponse.json(
        { error: "OpenAI respondió algo que no es JSON. ¿Hay un proxy o cortafuegos por medio?" },
        { status: 502 });
    }

    const bruto = j?.choices?.[0]?.message?.content;
    if (!bruto) return NextResponse.json({ error: "El modelo no devolvió nada." }, { status: 502 });

    let data: unknown;
    try { data = JSON.parse(bruto); }
    catch { return NextResponse.json({ error: "El modelo no devolvió un JSON válido." }, { status: 502 }); }

    // El tamaño lo manda el servidor, no el modelo: si se inventa 1920x1080
    // cuando se pidió vertical, las capas no encajarían con lo que luego se
    // genera, y eso solo se descubre al apilarlas.
    const d = data as any;
    if (d?.scene) { d.scene.width = w; d.scene.height = h; }

    const revisado = revisar(d);
    if ("error" in revisado) {
      // Se devuelve TAMBIÉN lo que contestó: así se puede corregir a mano en el
      // editor en vez de perder la respuesta y volver a pagarla.
      return NextResponse.json(
        { error: `El mapa que devolvió no vale: ${revisado.error}`, bruto: d },
        { status: 422 },
      );
    }
    // La animación se traduce AQUÍ a la cola del motor: el modelo escribe
    // intenciones y los números de cámara los pone quien los sabe.
    const anim = leerAnimacion(d, revisado.escena);
    const planSprites = parsed.data.viva
      ? leerSpritesPlaneados(d, revisado.escena, catalogo)
      : { sprites: [], avisos: [] };
    return NextResponse.json({
      ok: true,
      escena: revisado.escena,
      animacion: anim.pasos,
      notas: anim.notas,
      // Lo que se ha tenido que enderezar se dice, no se hace a escondidas.
      avisos: [...anim.avisos, ...planSprites.avisos],
      efectos: Array.isArray(d?.efectos) ? d.efectos : [],
      sprites: planSprites.sprites,
    });
  } catch (e: any) {
    return NextResponse.json({ error: motivoFallo(e, "texto") }, { status: 502 });
  }
}
