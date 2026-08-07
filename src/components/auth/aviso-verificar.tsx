import { MailWarning } from "lucide-react";
import { ReenviarVerificacion } from "@/components/auth/reenviar-verificacion";

/**
 * Aviso de cuenta sin confirmar.
 *
 * Dice lo que SÍ se puede hacer antes que lo que no. Quien acaba de
 * registrarse no ha hecho nada mal, y el editor entero le funciona: lo único
 * que espera al correo es la IA.
 */
export function AvisoVerificar({ email }: { email: string }) {
  return (
    <div className="card border-gold/40 bg-gold/5 p-4">
      <div className="flex items-start gap-3">
        <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-fg">Confirma tu correo para usar la IA</p>
          <p className="text-xs text-muted">
            Te mandamos un enlace a <b className="text-fg">{email}</b>. El editor funciona igual;
            lo que espera es la IA.
          </p>
          <ReenviarVerificacion compacto />
        </div>
      </div>
    </div>
  );
}
