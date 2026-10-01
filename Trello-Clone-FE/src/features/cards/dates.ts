// Due dates are whole days (docs/design/ui.md → Card modal): the date picker stores the end of
// that day in UTC, and the day is always shown in UTC, so it reads the same in every time zone.

/** The `yyyy-mm-dd` value of a date input for a stored due date. */
export const dueDateInputValue = (dueDate: string | null) => (dueDate ? dueDate.slice(0, 10) : '');

/** The stored due date for a date input's `yyyy-mm-dd` value (empty clears it). */
export const dueDateFromInput = (value: string) => (value ? `${value}T23:59:59.999Z` : null);

/** "Oct 12" for a due date. */
export const formatDueDate = (dueDate: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(dueDate),
  );

/** Past its due date and not completed (shown in red). */
export const isOverdue = (dueDate: string | null, completed: boolean, now = new Date()) =>
  dueDate !== null && !completed && new Date(dueDate) < now;
