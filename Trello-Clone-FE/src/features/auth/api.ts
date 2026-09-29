import { apiClient } from '@/api/client';

import type { AuthResponse, RegisterInput } from '@trello-clone/shared';

export const authApi = {
  /** POST /auth/register: also sets the HttpOnly refresh cookie (withCredentials). */
  register: (input: RegisterInput) => apiClient.post<AuthResponse>('/auth/register', input),
};
