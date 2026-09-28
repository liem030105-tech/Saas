import type { RequestHandler } from 'msw';

// Default handlers shared by every test; tests override per case with server.use(...).
export const handlers: RequestHandler[] = [];
