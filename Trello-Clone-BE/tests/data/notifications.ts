// Notification test data (NOTIFICATIONS-001).
export const notificationData = {
  actorName: 'Ada Lovelace',
  workspaceName: 'Acme',
  workspaceSlug: 'acme',
  boardTitle: 'Roadmap',
  otherBoardTitle: 'Backlog',
  listTitle: 'To do',
  cardTitle: 'Fix login',
  dueDate: '2026-10-12T23:59:59.999Z',
  /** Longer than the 140-character excerpt. */
  longComment: `Steps to reproduce: ${'open the login page and submit the form; '.repeat(6)}`,
  /** An email no account has. */
  unknownEmail: 'nobody@example.test',
  /** A cuid nothing has. */
  unknownId: 'clx0000000000000000000099',
};
