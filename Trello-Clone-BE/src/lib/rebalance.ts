import {
  initialPosition,
  needsRebalance,
  POSITION_STEP,
  positionAfter,
} from '@trello-clone/shared';

import { Prisma } from '../generated/prisma/client';

// Container rebalancing (docs/database/relationships.md → Rebalancing). The pure position math
// lives in @trello-clone/shared (ADR-017); this file is the part that touches the database.

/**
 * The ordered containers and the column that groups them: lists by board (LIST-003), cards by
 * list (CARD-003), checklists by card and their items by checklist (CARD-005). Identifiers only
 * ever come from this map, never from a caller's string.
 */
const CONTAINER_COLUMNS = {
  List: 'boardId',
  Card: 'listId',
  Checklist: 'cardId',
  ChecklistItem: 'checklistId',
} as const;

export type RebalanceTable = keyof typeof CONTAINER_COLUMNS;
export type ContainerColumn<T extends RebalanceTable> = (typeof CONTAINER_COLUMNS)[T];

type Tx = Prisma.TransactionClient;

function identifiers<T extends RebalanceTable>(table: T, containerColumn: ContainerColumn<T>) {
  if (CONTAINER_COLUMNS[table] !== containerColumn) {
    throw new Error(`Unknown container ${table}.${containerColumn}`);
  }
  return { table: Prisma.raw(`"${table}"`), column: Prisma.raw(`"${containerColumn}"`) };
}

/**
 * Locks every row of the given containers in one statement, in id order: every writer takes its
 * locks in the same global order, so writers on overlapping containers (a card moving from one
 * list to another while another card moves back) wait for each other instead of deadlocking.
 * Call it first in a transaction that writes a position, so the write, the threshold check and
 * any rebalance see stable containers. `FOR NO KEY UPDATE` serializes position writers without
 * blocking foreign-key checks on these rows (e.g. a card being added to a list). An empty
 * container has no rows to lock.
 */
export async function lockContainers<T extends RebalanceTable>(
  tx: Tx,
  table: T,
  containerColumn: ContainerColumn<T>,
  containerIds: string[],
) {
  const sql = identifiers(table, containerColumn);
  await tx.$queryRaw`
    SELECT "id" FROM ${sql.table}
    WHERE ${sql.column} IN (${Prisma.join([...new Set(containerIds)])})
    ORDER BY "id" FOR NO KEY UPDATE`;
}

/** lockContainers for one container. */
export function lockContainer<T extends RebalanceTable>(
  tx: Tx,
  table: T,
  containerColumn: ContainerColumn<T>,
  containerId: string,
) {
  return lockContainers(tx, table, containerColumn, [containerId]);
}

/**
 * Renumbers every item of a container (archived ones too) to 1024, 2048, 3072, … in the current
 * `position, id` order, after locking them. Returns the new position of each item by id.
 */
export async function rebalanceContainer<T extends RebalanceTable>(
  tx: Tx,
  table: T,
  containerColumn: ContainerColumn<T>,
  containerId: string,
): Promise<Map<string, number>> {
  await lockContainer(tx, table, containerColumn, containerId);
  const sql = identifiers(table, containerColumn);
  const rows = await tx.$queryRaw<{ id: string; position: number }[]>`
    UPDATE ${sql.table} AS item
    SET "position" = ranked.rank * ${POSITION_STEP}::double precision
    FROM (
      SELECT "id", ROW_NUMBER() OVER (ORDER BY "position", "id") AS rank
      FROM ${sql.table}
      WHERE ${sql.column} = ${containerId}
    ) AS ranked
    WHERE item."id" = ranked."id"
    RETURNING item."id", item."position"`;
  return new Map(rows.map((row) => [row.id, row.position]));
}

/**
 * The position after a container's last item (archived ones included, so a new item never lands
 * between them and a later unarchive), or the first position for an empty container.
 */
export async function appendPosition<T extends RebalanceTable>(
  tx: Tx,
  table: T,
  containerColumn: ContainerColumn<T>,
  containerId: string,
): Promise<number> {
  const sql = identifiers(table, containerColumn);
  const [row] = await tx.$queryRaw<{ last: number | null }[]>`
    SELECT MAX("position") AS last FROM ${sql.table} WHERE ${sql.column} = ${containerId}`;
  return row?.last == null ? initialPosition() : positionAfter(row.last);
}

/**
 * After an item was written at a position (inside a transaction that already holds the container's
 * locks): rebalances the container when the item sits closer than the threshold to a neighbour or
 * to 0 (docs/database/relationships.md → Rebalancing). Returns the item's final position.
 */
export async function settlePosition<T extends RebalanceTable>(
  tx: Tx,
  table: T,
  containerColumn: ContainerColumn<T>,
  containerId: string,
  itemId: string,
): Promise<number> {
  const sql = identifiers(table, containerColumn);
  const siblings = await tx.$queryRaw<{ id: string; position: number }[]>`
    SELECT "id", "position" FROM ${sql.table}
    WHERE ${sql.column} = ${containerId}
    ORDER BY "position", "id"`;
  const index = siblings.findIndex((item) => item.id === itemId);
  const { position } = siblings[index]!;
  const before = siblings[index - 1]?.position;
  const after = siblings[index + 1]?.position;
  const crowded =
    needsRebalance(position, before) || (after !== undefined && needsRebalance(position, after));
  if (!crowded) return position;
  const positions = await rebalanceContainer(tx, table, containerColumn, containerId);
  return positions.get(itemId)!;
}
