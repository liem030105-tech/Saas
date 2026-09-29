import { buildErrorBody } from './api';

import type { AuthResponse } from '@trello-clone/shared';

/** What a user types into the register form. */
export const registerFormInput = {
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  password: 'correct horse battery',
};

export const registerResponse: AuthResponse = {
  user: {
    id: 'clx0000000000000000000001',
    email: registerFormInput.email,
    name: registerFormInput.name,
    avatarUrl: null,
    createdAt: '2026-09-29T10:00:00.000Z',
  },
  accessToken: 'header.payload.signature',
};

/** The BE's 409 body for an email that is already registered. */
export const emailTakenBody = buildErrorBody({
  code: 'CONFLICT',
  message: 'An account with this email already exists',
  details: [],
});

/** Form input the shared schema rejects, with the message shown under each field. */
export const invalidRegisterForm = {
  input: { name: '   ', email: 'not-an-email', password: 'short' },
  messages: {
    name: 'Enter your name',
    email: 'Enter a valid email address',
    password: 'Password must be at least 8 characters',
  },
};
