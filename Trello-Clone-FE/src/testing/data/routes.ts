// Paths and the heading each page shows; router tests iterate over these.
export const pageCases = {
  home: { path: '/', heading: 'TaskBoard' },
  login: { path: '/login', heading: 'Log in' },
  register: { path: '/register', heading: 'Create an account' },
} as const;

export const notFoundCase = {
  path: '/this/route/does-not-exist',
  heading: 'Page not found',
} as const;
