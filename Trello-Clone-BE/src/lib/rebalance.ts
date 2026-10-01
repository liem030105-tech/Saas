import { POSITION_STEP } from '@trello-clone/shared';

import { Prisma } from '../generated/prisma/client';

// Container rebalancing (docs/database/relationships.md → Rebalancing). The pure position math
// lives in @trello-clone/shared (ADR-017); this file is the part that touches the database.

/**
 * The ordered containers and the column that groups them: lists by board (LIST-003), cards by
 * list (CARD-003). Identifiers only ever come from this map, never from a caller's string.
 */
const CONTAINER_COLUMNS = { List: 'boardId', Card: 'listId' } as const;

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
 * Locks every row of one container (`FOR UPDATE`, in id order so concurrent writers always take
 * the locks in the same order and cannot deadlock). Call it first in a transaction that writes a
 * position, so the write, the threshold check and any rebalance see a stable container.
 */
export async function lockContainer<T extends RebalanceTable>(
  tx: Tx,
  table: T,
  containerColumn: ContainerColumn<T>,
  containerId: string,
) {
  const sql = identifiers(table, containerColumn);
  await tx.$queryRaw`
    SELECT "id" FROM ${sql.table} WHERE ${sql.column} = ${containerId} ORDER BY "id" FOR UPDATE`;
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
