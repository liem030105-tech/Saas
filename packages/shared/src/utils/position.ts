// Ordering helpers (ADR-017, docs/database/relationships.md → Ordering). Pure formulas only: the FE
// predicts with them exactly what the BE stores. Rebalancing touches the database and stays in the BE.

/** Gap between neighbours when a container is (re)numbered: 1024, 2048, 3072, … */
export const POSITION_STEP = 1024;

/** Below this gap (or this position) the container must be rebalanced. */
export const REBALANCE_THRESHOLD = 1e-6;

/** The first item in an empty container. */
export function initialPosition(): number {
  return POSITION_STEP;
}

/** After the current last item (`last`). */
export function positionAfter(last: number): number {
  return last + POSITION_STEP;
}

/** Before the current first item (`first`). */
export function positionBefore(first: number): number {
  return first / 2;
}

/** Strictly between the neighbours `a` and `b`, in either order. */
export function positionBetween(a: number, b: number): number {
  return (a + b) / 2;
}

/**
 * Whether a write at `position` next to `neighbour` (omit it when there is none) needs the
 * container rebalanced: the position itself or the gap to the neighbour fell below the threshold.
 */
export function needsRebalance(position: number, neighbour?: number): boolean {
  if (position < REBALANCE_THRESHOLD) return true;
  return neighbour !== undefined && Math.abs(position - neighbour) < REBALANCE_THRESHOLD;
}
