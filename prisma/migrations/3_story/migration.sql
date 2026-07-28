-- CreateTable
CREATE TABLE "StoryProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryProject_userId_idx" ON "StoryProject"("userId");

-- AddForeignKey
ALTER TABLE "StoryProject" ADD CONSTRAINT "StoryProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
