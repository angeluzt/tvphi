CREATE TABLE "SpriteCharacter" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "nombre" TEXT NOT NULL,
 "descripcion" TEXT NOT NULL, "referencia" BYTEA NOT NULL, "bytesReferencia" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SpriteCharacter_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SpriteAnimation" (
 "id" TEXT NOT NULL, "characterId" TEXT NOT NULL, "nombre" TEXT NOT NULL, "que" TEXT NOT NULL,
 "fotogramas" INTEGER NOT NULL, "fps" INTEGER NOT NULL, "vista" TEXT NOT NULL, "direccion" TEXT NOT NULL,
 "accion" TEXT NOT NULL, "anclaje" TEXT NOT NULL, "croma" TEXT NOT NULL, "columnas" INTEGER NOT NULL,
 "filas" INTEGER NOT NULL, "anchoHoja" INTEGER NOT NULL, "altoHoja" INTEGER NOT NULL,
 "ancho" INTEGER NOT NULL, "alto" INTEGER NOT NULL, "celdas" JSONB NOT NULL,
 "hojaOriginal" BYTEA NOT NULL, "hojaTrabajo" BYTEA, "tira" BYTEA, "atlasFrames" JSONB,
 "bytesOriginal" INTEGER NOT NULL, "bytesTrabajo" INTEGER NOT NULL, "bytesTira" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SpriteAnimation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SpriteAtlas" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "ancho" INTEGER NOT NULL DEFAULT 2048,
 "alto" INTEGER NOT NULL DEFAULT 2048, "png" BYTEA NOT NULL, "bytes" INTEGER NOT NULL,
 "cursorX" INTEGER NOT NULL DEFAULT 2, "cursorY" INTEGER NOT NULL DEFAULT 2,
 "altoFila" INTEGER NOT NULL DEFAULT 0, "usados" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SpriteAtlas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SpriteCharacter_userId_updatedAt_idx" ON "SpriteCharacter"("userId", "updatedAt");
CREATE INDEX "SpriteAnimation_characterId_updatedAt_idx" ON "SpriteAnimation"("characterId", "updatedAt");
CREATE INDEX "SpriteAtlas_userId_createdAt_idx" ON "SpriteAtlas"("userId", "createdAt");
ALTER TABLE "SpriteCharacter" ADD CONSTRAINT "SpriteCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpriteAnimation" ADD CONSTRAINT "SpriteAnimation_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "SpriteCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpriteAtlas" ADD CONSTRAINT "SpriteAtlas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
