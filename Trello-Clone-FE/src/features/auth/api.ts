import { apiClient } from '@/api/client';

import type { AuthResponse, LoginInput, RegisterInput } from '@trello-clone/shared';

export const authApi = {
  /** POST /auth/register: also sets the HttpOnly refresh cookie (withCredentials). */
  register: (input: RegisterInput) => apiClient.post<AuthResponse>('/auth/register', input),
  /** POST /auth/login: starts a new session; the refresh cookie is set the same way. */
  login: (input: LoginInput) => apiClient.post<AuthResponse>('/auth/login', input),
};
