/** "Oct 7, 2026" for an ISO date (UI text is English, ADR-019). */
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(iso));
