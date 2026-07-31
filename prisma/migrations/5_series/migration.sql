-- Series de capítulos. Todo aditivo: no se toca ninguna fila existente.
-- Los proyectos y personajes que ya hay se quedan con seriesId NULL ("sin serie").

-- CreateTable
CREATE TABLE "StorySeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorySeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorySeries_userId_idx" ON "StorySeries"("userId");

-- AddForeignKey
ALTER TABLE "StorySeries" ADD CONSTRAINT "StorySeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: columna nueva y opcional, sin valor por defecto y sin tocar filas
ALTER TABLE "StoryProject" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "StoryCharacter" ADD COLUMN "seriesId" TEXT;

-- CreateIndex
CREATE INDEX "StoryProject_seriesId_idx" ON "StoryProject"("seriesId");
CREATE INDEX "StoryCharacter_seriesId_idx" ON "StoryCharacter"("seriesId");

-- AddForeignKey: al borrar una serie, sus capítulos y personajes NO se borran,
-- se quedan sueltos (SET NULL).
ALTER TABLE "StoryProject" ADD CONSTRAINT "StoryProject_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "StorySeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoryCharacter" ADD CONSTRAINT "StoryCharacter_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "StorySeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
