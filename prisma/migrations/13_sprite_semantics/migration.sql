-- La orientación intrínseca del dibujo permite que una ruta sepa cuándo
-- espejarlo. El anclaje distingue «centro en el aire» de «pies sobre suelo».
ALTER TABLE "Sprite"
ADD COLUMN "vista" TEXT NOT NULL DEFAULT 'lateral',
ADD COLUMN "direccion" TEXT NOT NULL DEFAULT 'derecha',
ADD COLUMN "accion" TEXT NOT NULL DEFAULT 'otro',
ADD COLUMN "anclaje" TEXT NOT NULL DEFAULT 'centro';
