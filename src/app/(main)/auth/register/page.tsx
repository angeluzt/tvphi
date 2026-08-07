import { claveSitioCaptcha } from "@/lib/captcha";
import { RegisterForm } from "@/components/auth/register-form";

// La clave del captcha se lee AQUÍ, en el servidor, y baja como propiedad.
//
// Con NEXT_PUBLIC_… habría quedado grabada al compilar, así que ponerla en
// Railway después del build no habría servido de nada y el widget no saldría
// —sin ningún error visible, que es lo peor—. Leyéndola en cada visita, se
// enciende en cuanto la variable está puesta.

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <RegisterForm claveCaptcha={claveSitioCaptcha()} />;
}
