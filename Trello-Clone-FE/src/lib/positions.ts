import {
  initialPosition,
  positionAfter,
  positionBefore,
  positionBetween,
} from '@trello-clone/shared';

/**
 * The position for an item dropped at `index` among `siblings` (sorted, without the dragged item):
 * between its new neighbours, with the shared formulas the server also uses (ADR-017).
 */
export function positionAt(siblings: readonly { position: number }[], index: number): number {
  const before = siblings[index - 1];
  const after = siblings[index];
  if (!before && !after) return initialPosition();
  if (!before) return positionBefore(after!.position);
  if (!after) return positionAfter(before.position);
  return positionBetween(before.position, after.position);
}

/**
 * The position between two neighbours given by their stored positions (either may be missing at
 * the start or end of the container).
 */
export function positionBetweenNeighbours(before?: number, after?: number): number {
  const siblings = [before, after]
    .filter((p): p is number => p !== undefined)
    .map((position) => ({ position }));
  return positionAt(siblings, before === undefined ? 0 : 1);
}
