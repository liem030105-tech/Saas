// Board search and filters (SEARCH-001): what the filter bar sends and what the board shows.

import { loginCard, signupCard } from './cards';
import { urgentLabel } from './labels';

export const searchFilters = {
  /** Typed into "Search cards"; sent trimmed. */
  text: { typed: '  login ', sent: 'login' },
  label: { option: 'Urgent', sent: urgentLabel.id },
  due: { option: 'Overdue', sent: 'overdue' },
};

/** GET /boards/:boardId/search answers: login matches the text and the label; nothing is overdue. */
export const searchResults = {
  login: [loginCard],
  none: [],
  both: [loginCard, signupCard],
};
