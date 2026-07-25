-- CreateTable
CREATE TABLE "ChannelEmote" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelEmote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelEmote_channelId_idx" ON "ChannelEmote"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelEmote_channelId_code_key" ON "ChannelEmote"("channelId", "code");

-- AddForeignKey
ALTER TABLE "ChannelEmote" ADD CONSTRAINT "ChannelEmote_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
