-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'ATTACHMENT_ADDED';

-- AlterTable
ALTER TABLE "Card" DROP COLUMN "coverUrl",
ADD COLUMN     "coverAttachmentId" TEXT;

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_cardId_createdAt_idx" ON "Attachment"("cardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Card_coverAttachmentId_key" ON "Card"("coverAttachmentId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_coverAttachmentId_fkey" FOREIGN KEY ("coverAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

