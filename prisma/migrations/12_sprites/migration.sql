-- CreateTable
CREATE TABLE "Sprite" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "que" TEXT NOT NULL,
    "fotogramas" INTEGER NOT NULL,
    "fps" INTEGER NOT NULL,
    "ancho" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "tira" BYTEA NOT NULL,
    "bytes" INTEGER NOT NULL,
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sprite_createdAt_idx" ON "Sprite"("createdAt");
