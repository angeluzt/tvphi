-- Vincula la ficha narrativa con su identidad animada sin afectar personajes
-- de sprites creados antes de existir esta relación.
ALTER TABLE "SpriteCharacter" ADD COLUMN "storyCharacterId" TEXT;

CREATE UNIQUE INDEX "SpriteCharacter_storyCharacterId_key"
ON "SpriteCharacter"("storyCharacterId");

ALTER TABLE "SpriteCharacter" ADD CONSTRAINT "SpriteCharacter_storyCharacterId_fkey"
FOREIGN KEY ("storyCharacterId") REFERENCES "StoryCharacter"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
