import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAccessToken, setAccessToken } from '@/api/token-store';

import { authApi } from './api';
import { setSignedOutByUser } from './session';

import type { AuthResponse } from '@trello-clone/shared';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/** Keeps the access token in memory only and seeds the current-user cache. */
function useSignIn() {
  const queryClient = useQueryClient();
  return ({ accessToken, user }: AuthResponse) => {
    setSignedOutByUser(false);
    setAccessToken(accessToken);
    queryClient.setQueryData(authKeys.me, user);
  };
}

/** Registers and signs the user in. */
export function useRegister() {
  const signIn = useSignIn();
  return useMutation({ mutationFn: authApi.register, onSuccess: signIn });
}

/** Signs in (the refresh token is an HttpOnly cookie). */
export function useLogin() {
  const signIn = useSignIn();
  return useMutation({ mutationFn: authApi.login, onSuccess: signIn });
}

/**
 * GET /auth/me. Rendered behind ProtectedRoute; never fetches without a token (e.g. while a page
 * is still mounted right after logout cleared the token and the cache).
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: authApi.me,
    enabled: getAccessToken() !== null,
  });
}

/** PATCH /users/me; the response replaces the cached current user. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}
