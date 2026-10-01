-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'LABEL_ADDED';
ALTER TYPE "ActivityType" ADD VALUE 'LABEL_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE 'CHECKLIST_ADDED';
ALTER TYPE "ActivityType" ADD VALUE 'CHECKLIST_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE 'CHECKLIST_ITEM_CHECKED';

