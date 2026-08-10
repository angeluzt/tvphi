-- Enlace opcional: sprite público ↔ animación editable del taller (plantilla completa).
ALTER TABLE "Sprite" ADD COLUMN "animationId" TEXT;
CREATE INDEX "Sprite_animationId_idx" ON "Sprite"("animationId");
