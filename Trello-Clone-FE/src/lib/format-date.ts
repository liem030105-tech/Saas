/** "Oct 7, 2026" for an ISO date (UI text is English, ADR-019). */
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(iso));

/** "Oct 7, 2026, 2:30 PM" for an ISO timestamp, in the viewer's time zone. */
export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
