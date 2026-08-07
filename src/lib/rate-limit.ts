import "server-only";

// Topes por ventana móvil, en memoria.
//
// EN MEMORIA Y NO EN LA BASE a propósito: esto tiene que responder antes de
// tocar nada, y una consulta por intento es justo lo que un ataque quiere que
// hagas. Se pierde al reiniciar el servidor, y con varias instancias cada una
// lleva su cuenta —o sea que el tope real se multiplica por el número de
// instancias—. Aun así frena lo que hay que frenar: el guion que abre cuentas
// en bucle desde una misma salida.
//
// Si algún día hace falta que sea exacto entre instancias, esto se cambia por
// Redis sin tocar a quien lo llama.

type Sello = number[];
const cubos = new Map<string, Sello>();

/** Últimos limpiados, para no barrer el mapa en cada llamada. */
let ultimaLimpieza = 0;
const LIMPIAR_CADA = 60_000;

function limpiar(ahora: number) {
  if (ahora - ultimaLimpieza < LIMPIAR_CADA) return;
  ultimaLimpieza = ahora;
  for (const [k, v] of cubos) {
    // La ventana más larga que se usa; de sobra para no borrar nada vivo.
    if (!v.some((t) => ahora - t < 24 * 60 * 60 * 1000)) cubos.delete(k);
  }
}

/**
 * ¿Hay que cortar? Además apunta el intento cuando NO se corta.
 *
 * Que solo cuente el intento permitido es deliberado: si cada golpe alargara la
 * ventana, quien se pasa de la raya se quedaría fuera indefinidamente mientras
 * siguiera intentándolo, y eso castiga tanto al guion como a la persona que le
 * dio dos veces al botón.
 */
export function pasarse(clave: string, tope: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  limpiar(ahora);
  const previos = (cubos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (previos.length >= tope) {
    cubos.set(clave, previos);
    return true;
  }
  previos.push(ahora);
  cubos.set(clave, previos);
  return false;
}

/** Solo para las pruebas: deja el contador a cero. */
export function olvidarTodo() {
  cubos.clear();
  ultimaLimpieza = 0;
}

/**
 * De dónde viene la petición.
 *
 * Detrás de un proxy (Railway) el socket es el del proxy, así que sin mirar la
 * cabecera todo el mundo comparte el mismo cubo y el tope caería sobre usuarios
 * de verdad. Se coge la PRIMERA de x-forwarded-for, que es la que pone el borde.
 */
export function origen(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const primera = xff.split(",")[0]?.trim();
    if (primera) return primera;
  }
  return req.headers.get("x-real-ip")?.trim() || "desconocido";
}
