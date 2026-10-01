-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardLabel" (
    "cardId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "CardLabel_pkey" PRIMARY KEY ("cardId","labelId")
);

-- CreateIndex
CREATE INDEX "Label_boardId_idx" ON "Label"("boardId");

-- CreateIndex
CREATE INDEX "CardLabel_labelId_idx" ON "CardLabel"("labelId");

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardLabel" ADD CONSTRAINT "CardLabel_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardLabel" ADD CONSTRAINT "CardLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (docs/api/boards.md → Labels): every existing board gets the six default colour-only
-- labels that board creation adds from CARD-005 on. Ids are cuid-shaped ("c" + 24 characters)
-- and start with "c0", so they sort before any label created later (labels are listed by id) and,
-- per board, in the default colour order.
INSERT INTO "Label" ("id", "boardId", "name", "color")
SELECT 'c0' || substr(md5(b."id"), 1, 21) || d.ord, b."id", '', d.color
FROM "Board" b
CROSS JOIN (VALUES
  (1, '#61bd4f'),
  (2, '#f2d600'),
  (3, '#ff9f1a'),
  (4, '#eb5a46'),
  (5, '#c377e0'),
  (6, '#0079bf')
) AS d(ord, color);
