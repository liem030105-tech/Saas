import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';

export const LAST_OWNER_MESSAGE = 'A workspace needs an owner. Make another member an owner first.';

/** User-facing text for a failed member action; LAST_OWNER gets its own explanation. */
export function memberErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === 'BUSINESS_RULE_VIOLATION' && error.details[0]?.rule === 'LAST_OWNER') {
      return LAST_OWNER_MESSAGE;
    }
    if (error.code !== NETWORK_ERROR_CODE) return error.message;
  }
  return fallback;
}
