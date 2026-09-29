import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { setAccessToken } from '@/api/token-store';

import { authApi } from './api';
import { LOGIN_PATH, setSignedOutByUser } from './session';

export const LOGOUT_FAILED_MESSAGE =
  "Couldn't reach the server, so you may still be signed in on this device. Log out again when you're back online.";

/**
 * Signs out of this device (docs/api/authentication.md → POST /auth/logout). Whatever the server
 * answers, the local session ends: drop the in-memory token and the whole query cache, so the next
 * user of this browser sees none of this user's data, and go to a plain /login.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.logout,
    // The server session (and its cookie) may survive, so a reload could sign the user back in.
    onError: () => toast.error(LOGOUT_FAILED_MESSAGE),
    onSettled: async () => {
      // Marked first: a protected page that re-renders before the navigation below lands also
      // redirects to a plain /login, never to /login?redirectTo=<this user's page>.
      setSignedOutByUser(true);
      setAccessToken(null);
      queryClient.clear();
      await navigate(LOGIN_PATH, { replace: true });
    },
  });
}
