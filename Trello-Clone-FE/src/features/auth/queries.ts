import { useMutation } from '@tanstack/react-query';

import { setAccessToken } from '@/api/token-store';

import { authApi } from './api';

/** Registers and signs the user in: the access token goes to memory only. */
export function useRegister() {
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: ({ accessToken }) => setAccessToken(accessToken),
  });
}
