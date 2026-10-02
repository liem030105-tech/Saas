// Card search test data (SEARCH-001). Due dates are whole days from the real clock, far from every
// window edge, so the moments between seeding and the request never change a result.

const DAY = 24 * 60 * 60 * 1000;

export const searchData = {
  workspaceName: 'Search',
  boardTitle: 'Roadmap',
  lists: ['To do', 'Doing'],
  /** Cards by key: title, description, and how many days from now each is due. */
  cards: {
    login: { title: 'Fix LOGIN form', description: null, dueInDays: -2 },
    signup: { title: 'Sign-up', description: 'after the login works', dueInDays: 3 },
    percent: { title: 'Raise coverage to 50%', description: null, dueInDays: 20 },
    underscore: { title: 'Rename user_id', description: null, dueInDays: null },
    /** Decoys: found by `50%`, `user_id` or `\\` only if the wildcards were not escaped. */
    percentDecoy: { title: 'Raise coverage to 500', description: null, dueInDays: 30 },
    underscoreDecoy: { title: 'Rename userXid', description: null, dueInDays: 30 },
    backslash: { title: 'Path C:\\temp', description: null, dueInDays: 30 },
    done: { title: 'Old login bug', description: null, dueInDays: -5, completed: true },
  },
  /** A card in an archived list, and an archived card: never found. */
  hidden: { archivedCard: 'Archived login', archivedList: 'Login in an archived list' },
  dueDate: (days: number) => new Date(Date.now() + days * DAY),
  /** Matches by wildcard only if `%` or `_` were not escaped. */
  wildcardQueries: {
    percent: '50%',
    underscore: 'user_id',
    literalPercent: '%',
    literalUnderscore: '_',
    backslash: ':\\',
  },
};
