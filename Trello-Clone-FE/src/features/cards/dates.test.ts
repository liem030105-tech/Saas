import { dueDateFromInput, dueDateInputValue, formatDueDate, isOverdue } from './dates';

describe('due dates (whole days in UTC)', () => {
  it('round-trips a picked day through the stored value', () => {
    expect(dueDateFromInput('2026-10-12')).toBe('2026-10-12T23:59:59.999Z');
    expect(dueDateInputValue('2026-10-12T23:59:59.999Z')).toBe('2026-10-12');
    expect(dueDateFromInput('')).toBeNull();
    expect(dueDateInputValue(null)).toBe('');
  });

  it('shows the UTC day', () => {
    expect(formatDueDate('2026-10-12T23:59:59.999Z')).toBe('Oct 12');
  });

  it('is overdue after the day ends, unless completed', () => {
    const due = '2026-10-12T23:59:59.999Z';
    expect(isOverdue(due, false, new Date('2026-10-12T20:00:00Z'))).toBe(false);
    expect(isOverdue(due, false, new Date('2026-10-13T00:00:00Z'))).toBe(true);
    expect(isOverdue(due, true, new Date('2026-10-13T00:00:00Z'))).toBe(false);
    expect(isOverdue(null, false)).toBe(false);
  });
});
