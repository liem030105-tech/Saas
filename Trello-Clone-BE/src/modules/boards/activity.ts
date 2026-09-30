import type { ActivityType, Prisma } from '../../generated/prisma/client';

// The activity log (BOARD-001): every change that logs one writes it with this helper, inside the
// same transaction as the change, so the log never disagrees with the data.

export interface ActivityEntry {
  boardId: string;
  /** The actor. */
  userId: string;
  type: ActivityType;
  /** Event details; keep them small and free of secrets. */
  data: Prisma.InputJsonObject;
}

export function logActivity(tx: Prisma.TransactionClient, entry: ActivityEntry) {
  return tx.activity.create({ data: entry });
}
