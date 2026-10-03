// Node's File for tests that hand Node's FormData a file (features/cards/attachments.test.tsx). The
// FE has no Node types; this declares only what those tests use.
declare module 'node:buffer' {
  export const File: typeof globalThis.File;
}
