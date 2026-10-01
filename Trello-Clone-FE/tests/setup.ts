import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

import { closeRealtime } from '@/lib/socket';
import { server } from '@/testing/mocks/server';
import { installFakeRealtime } from '@/testing/realtime';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
// No test talks to a real Socket.IO server: each gets an in-memory connection (testing/realtime).
beforeEach(installFakeRealtime);
afterEach(() => {
  cleanup();
  closeRealtime();
  server.resetHandlers();
});
afterAll(() => server.close());
