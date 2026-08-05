-- Fecha del último cambio de contraseña. Las sesiones firmadas antes dejan de
-- valer, que es lo que expulsa a quien tuviera la cuenta abierta.
-- Nulo para las cuentas que ya existen: no se echa a nadie por desplegar esto.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
