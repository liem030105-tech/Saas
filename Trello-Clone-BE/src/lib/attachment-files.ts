import { Prisma } from '../generated/prisma/client';

// Files of attachments about to go with a cascade (ATTACHMENTS-001): a card, list, board or
// workspace delete removes the rows through foreign keys, so the S3 objects are collected first
// and deleted after the commit (lib/storage → removeFiles).

export type AttachmentScope =
  { cardId: string } | { listId: string } | { boardId: string } | { workspaceId: string };

function cardsIn(scope: AttachmentScope) {
  if ('cardId' in scope) return Prisma.sql`c."id" = ${scope.cardId}`;
  if ('listId' in scope) return Prisma.sql`c."listId" = ${scope.listId}`;
  if ('boardId' in scope) return Prisma.sql`c."boardId" = ${scope.boardId}`;
  return Prisma.sql`c."boardId" IN (SELECT "id" FROM "Board" WHERE "workspaceId" = ${scope.workspaceId})`;
}

/**
 * Locks the scope's container rows: a card created in or moved into the scope needs one of them
 * (its foreign key check takes FOR KEY SHARE), so it waits for the delete and then fails. A
 * workspace locks its boards too, since a card moved between its boards checks only the board.
 */
async function lockContainers(tx: Prisma.TransactionClient, scope: AttachmentScope) {
  if ('listId' in scope) {
    await tx.$queryRaw`SELECT "id" FROM "List" WHERE "id" = ${scope.listId} FOR UPDATE`;
  } else if ('boardId' in scope) {
    await tx.$queryRaw`SELECT "id" FROM "Board" WHERE "id" = ${scope.boardId} FOR UPDATE`;
  } else if ('workspaceId' in scope) {
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${scope.workspaceId} FOR UPDATE`;
    await tx.$queryRaw`
      SELECT "id" FROM "Board" WHERE "workspaceId" = ${scope.workspaceId} ORDER BY "id" FOR UPDATE`;
  }
}

/**
 * Locks the scope (its container rows, then its cards; FOR UPDATE, inside the delete's
 * transaction) and returns its attachments' storage keys. No card can join the scope meanwhile,
 * and an upload racing the delete waits for it and fails (its row needs the card), so it cleans
 * up its own object: no key is missed.
 */
export async function lockAttachmentKeys(
  tx: Prisma.TransactionClient,
  scope: AttachmentScope,
): Promise<string[]> {
  await lockContainers(tx, scope);
  await tx.$queryRaw`SELECT c."id" FROM "Card" c WHERE ${cardsIn(scope)} ORDER BY c."id" FOR UPDATE`;
  const rows = await tx.$queryRaw<{ storageKey: string }[]>`
    SELECT a."storageKey" FROM "Attachment" a JOIN "Card" c ON c."id" = a."cardId"
    WHERE ${cardsIn(scope)}`;
  return rows.map((row) => row.storageKey);
}
