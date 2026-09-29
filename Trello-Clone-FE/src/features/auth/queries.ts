import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { setAccessToken } from '@/api/token-store';

import { authApi } from './api';

import type { AuthResponse } from '@trello-clone/shared';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/** Keeps the access token in memory only and seeds the current-user cache. */
function useSignIn() {
  const queryClient = useQueryClient();
  return ({ accessToken, user }: AuthResponse) => {
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

/** GET /auth/me. Only rendered behind ProtectedRoute, so a session exists. */
export function useCurrentUser() {
  return useQuery({ queryKey: authKeys.me, queryFn: authApi.me });
}

/** PATCH /users/me; the response replaces the cached current user. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
}
