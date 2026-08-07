import "server-only";
import { env } from "@/lib/env";

// La plantilla de los correos de TVPHI.
//
// Un correo no es una página web, y casi todo lo que se hace en la app aquí no
// vale. Las reglas que manda el medio, para que no se deshagan por el camino:
//
// - MAQUETADO CON TABLAS. Outlook de escritorio dibuja con el motor de Word:
//   no entiende flex, ni grid, ni max-width sobre un div. Con tablas sí.
// - ESTILOS EN LÍNEA. Gmail recorta la hoja de estilos en varios sitios, y lo
//   que sobreviva no se puede predecir. Lo que va en el atributo `style` llega.
// - NADA DE SVG NI DE IMÁGENES SUELTAS. Gmail borra el SVG, y una imagen
//   alojada fuera sale rota mientras el lector no acepte «mostrar imágenes».
//   Así que el logo se dibuja con lo que hay: una celda de color con la φ
//   dentro y el nombre en texto.
// - EL DEGRADADO, CON COLOR DEBAJO. `linear-gradient` se ve en Apple Mail y en
//   Gmail web; donde no, queda el `background-color` sólido, que es el mismo
//   teal de la marca. Se pierde el degradado, no la identidad.
// - `background-clip: text` NO existe en el correo, así que «PHI» va en teal
//   liso en vez de degradado. Es lo más cerca que se puede estar del logo real.
// - El botón, también con tabla, y el enlace repetido en texto justo debajo:
//   quien lea en texto plano o tenga los botones capados sigue pudiendo entrar.

// Los mismos colores de globals.css, en hexadecimal: rgb(a b c) tampoco es
// seguro en correo, y las variables CSS menos todavía.
const C = {
  fondo: "#080b0c",     // --bg
  tarjeta: "#0f1416",   // --surface
  hueco: "#171d20",     // --surface-2
  borde: "#262e32",     // --border
  apagado: "#929ea2",   // --muted
  texto: "#eaf0f0",     // --fg
  marca: "#14b8a6",     // --brand (teal)
  acento: "#fb923c",    // --accent (coral)
};

const FUENTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const attr = (s: string) => escapeHtml(s).replace(/'/g, "&#39;");

export interface Plantilla {
  /** Lo que se ve en la lista del buzón, antes de abrir. */
  avance: string;
  titulo: string;
  saludo: string;
  /** Se admite <b> y <br>; el resto del texto ya viene escapado por quien llama. */
  parrafos: string[];
  boton: { texto: string; url: string };
  /** Bajo el botón, en pequeño: qué hacer si no era para ti. */
  coletilla: string;
}

export function correoHtml(p: Plantilla): string {
  const sitio = env.appUrl.replace(/\/$/, "");
  const dominio = sitio.replace(/^https?:\/\//, "");

  const parrafos = p.parrafos
    .map(
      (t) =>
        `<p style="margin:0 0 14px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${C.texto};">${t}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(p.titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.fondo};">
<!-- Lo que se lee en la lista del buzón. Va oculto y con espacios detrás para
     que el cliente no rellene el hueco con el principio del HTML. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(p.avance)}${"&#8203;&nbsp;".repeat(60)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.fondo};">
<tr><td align="center" style="padding:32px 16px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

    <!-- Logo -->
    <tr><td style="padding:0 4px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="36" height="36" align="center" valign="middle"
              style="width:36px;height:36px;border-radius:11px;background-color:${C.marca};background-image:linear-gradient(135deg,${C.marca} 0%,${C.acento} 100%);font-family:${FUENTE};font-size:17px;font-weight:700;color:#050807;line-height:36px;">&#966;</td>
          <td style="padding-left:10px;font-family:${FUENTE};font-size:19px;font-weight:800;letter-spacing:-0.4px;color:${C.texto};white-space:nowrap;">TV<span style="color:${C.marca};">PHI</span></td>
        </tr>
      </table>
    </td></tr>

    <!-- Tarjeta -->
    <tr><td style="background-color:${C.tarjeta};border:1px solid ${C.borde};border-radius:16px;">

      <!-- Filo de color arriba. Donde no haya degradado, queda el teal. -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td height="3" style="height:3px;line-height:3px;font-size:0;background-color:${C.marca};background-image:linear-gradient(90deg,${C.marca} 0%,${C.acento} 100%);border-radius:15px 15px 0 0;">&nbsp;</td></tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:28px 28px 24px;">

          <h1 style="margin:0 0 14px;font-family:${FUENTE};font-size:21px;line-height:1.3;font-weight:700;color:${C.texto};">${escapeHtml(p.titulo)}</h1>
          <p style="margin:0 0 14px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${C.texto};">${escapeHtml(p.saludo)}</p>
          ${parrafos}

          <!-- Botón -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 16px;">
            <tr><td align="center" style="border-radius:12px;background-color:${C.marca};">
              <a href="${attr(p.boton.url)}"
                 style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(p.boton.texto)}</a>
            </td></tr>
          </table>

          <!-- El enlace en texto: si el botón no pinta o no se puede pulsar,
               esto es lo que salva el correo. -->
          <p style="margin:0 0 6px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:${C.apagado};">Si el botón no funciona, copia esta dirección en tu navegador:</p>
          <p style="margin:0;padding:10px 12px;background-color:${C.hueco};border:1px solid ${C.borde};border-radius:10px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:${C.marca};word-break:break-all;">${escapeHtml(p.boton.url)}</p>

          <p style="margin:18px 0 0;padding-top:16px;border-top:1px solid ${C.borde};font-family:${FUENTE};font-size:12px;line-height:1.6;color:${C.apagado};">${escapeHtml(p.coletilla)}</p>

        </td></tr>
      </table>
    </td></tr>

    <!-- Pie -->
    <tr><td align="center" style="padding:18px 8px 0;font-family:${FUENTE};font-size:11px;line-height:1.6;color:${C.apagado};">
      <a href="${attr(sitio)}" style="color:${C.apagado};text-decoration:none;">${escapeHtml(dominio)}</a>
      &nbsp;·&nbsp; Videos narrados, desde el navegador.<br>
      Este correo es automático: no hace falta que respondas.
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}
