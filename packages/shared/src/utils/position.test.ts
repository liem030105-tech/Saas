import { describe, expect, it } from 'vitest';

import {
  initialPosition,
  needsRebalance,
  POSITION_STEP,
  positionAfter,
  positionBefore,
  positionBetween,
  REBALANCE_THRESHOLD,
} from './position';
import data from '../../tests/data/position.json';

describe('position helpers', () => {
  it('starts an empty container at the step', () => {
    expect(initialPosition()).toBe(POSITION_STEP);
    expect(POSITION_STEP).toBe(1024);
    expect(REBALANCE_THRESHOLD).toBe(1e-6);
  });

  it.each(data.after)('positionAfter($last) = $expected', ({ last, expected }) => {
    expect(positionAfter(last)).toBe(expected);
  });

  it.each(data.before)('positionBefore($first) = $expected', ({ first, expected }) => {
    expect(positionBefore(first)).toBeCloseTo(expected, 12);
  });

  it.each(data.between)('positionBetween($a, $b) = $expected', ({ a, b, expected }) => {
    const result = positionBetween(a, b);
    expect(result).toBe(expected);
    expect(result).toBeGreaterThan(Math.min(a, b));
    expect(result).toBeLessThan(Math.max(a, b));
  });

  it.each(data.rebalance)('needsRebalance: $case', ({ position, neighbour, expected }) => {
    expect(needsRebalance(position, neighbour)).toBe(expected);
  });

  it('halving before the first item eventually asks for a rebalance', () => {
    let first = initialPosition();
    let halvings = 0;
    while (!needsRebalance(first)) {
      first = positionBefore(first);
      halvings += 1;
    }
    expect(first).toBeGreaterThan(0);
    expect(halvings).toBeGreaterThan(20);
  });

  it('repeated inserts into one gap eventually ask for a rebalance', () => {
    const a = POSITION_STEP;
    let b = positionAfter(a);
    let inserts = 0;
    while (!needsRebalance(b, a)) {
      b = positionBetween(a, b);
      inserts += 1;
    }
    expect(b).toBeGreaterThan(a);
    expect(inserts).toBeGreaterThan(20);
  });
});
