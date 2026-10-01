import {
  ErrorResponseSchema,
  type ErrorCode,
  type ErrorDetail,
  type RefreshResponse,
} from '@trello-clone/shared';
import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

import { env } from '@/config/env';

import { getAccessToken, setAccessToken } from './token-store';

/**
 * FE-only code for failures that carry no canonical error body (network down, proxy HTML, …).
 * Not an API code, so it is not in @trello-clone/shared's ERROR_CODES.
 */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

export type ApiErrorCode = ErrorCode | typeof NETWORK_ERROR_CODE;

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    // The shared schema is the contract the BE's errorHandler produces (docs/api/README.md).
    const parsed = ErrorResponseSchema.safeParse(error.response?.data);
    if (parsed.success) {
      const { code, message, details, requestId } = parsed.data.error;
      return new ApiError(status, code, message, details, requestId);
    }
    return new ApiError(status, NETWORK_ERROR_CODE, error.message);
  }
  return new ApiError(
    0,
    NETWORK_ERROR_CODE,
    error instanceof Error ? error.message : String(error),
  );
}

// The single axios instance; `withCredentials` sends the refresh cookie to /auth/*.
export const http = axios.create({ baseURL: env.VITE_API_URL, withCredentials: true });

// --- Access token and refresh (docs/architecture/security.md → Frontend token handling) ---

/** `expired`: the session could not be refreshed. `reused`: the server saw a replayed token. */
export type SessionEndReason = 'expired' | 'reused';

let sessionEndedHandler: (reason: SessionEndReason) => void = () => {};

/** Registers what happens when the session ends (the app redirects to /login). Returns an unsubscribe. */
export function onSessionEnded(handler: (reason: SessionEndReason) => void) {
  sessionEndedHandler = handler;
  return () => {
    if (sessionEndedHandler === handler) sessionEndedHandler = () => {};
  };
}

/** Endpoints that never go through refresh-and-retry: they are how a session starts or ends. */
const SESSION_ENDPOINTS = ['/auth/register', '/auth/login', '/auth/refresh', '/auth/logout'];

let refreshing: Promise<string> | null = null;

/** The refresh cookie is missing, invalid, expired, or was replayed (401 from /auth/refresh). */
export const isSessionOver = (error: unknown) => error instanceof ApiError && error.status === 401;

/**
 * POST /auth/refresh, shared by every caller while it is in flight: two parallel refreshes would
 * rotate the same cookie twice and trip reuse detection. Stores and returns the new access token.
 * Rejects with an ApiError; only a 401 means the session is over (see `isSessionOver`).
 */
export function refreshAccessToken(): Promise<string> {
  refreshing ??= http
    .post<{ data: RefreshResponse }>('/auth/refresh')
    .then(({ data }) => {
      setAccessToken(data.data.accessToken);
      return data.data.accessToken;
    })
    .catch((error: unknown) => {
      const apiError = toApiError(error);
      // A 5xx or a network error says nothing about the cookie: keep the session state.
      if (isSessionOver(apiError)) setAccessToken(null);
      throw apiError;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const bearer = (token: string) => `Bearer ${token}`;

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = bearer(token);
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || !error.config) throw error;
  const original = error.config as RetriableConfig;
  const apiError = toApiError(error);
  if (
    apiError.status !== 401 ||
    apiError.code !== 'UNAUTHORIZED' ||
    original._retried ||
    SESSION_ENDPOINTS.includes(original.url ?? '')
  ) {
    throw error;
  }

  original._retried = true;
  const current = getAccessToken();
  // Another request refreshed while this one was in flight: retry with the new token directly.
  if (current && original.headers.Authorization !== bearer(current)) return http(original);
  try {
    await refreshAccessToken();
  } catch (refreshError) {
    // Only a 401 ends the session; an outage or a dropped connection surfaces as that error.
    if (!isSessionOver(refreshError)) throw refreshError;
    const reused = refreshError instanceof ApiError && refreshError.code === 'TOKEN_REUSED';
    sessionEndedHandler(reused ? 'reused' : 'expired');
    throw error;
  }
  return http(original); // retried once, with the new token
});

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await http.request<{ data: T } | ''>(config);
    // 204 No Content has no body.
    return (response.data === '' ? undefined : response.data.data) as T;
  } catch (error) {
    throw toApiError(error);
  }
}

/** A cursor-paginated list as the API sends it (docs/api/README.md → Pagination). */
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

async function requestPage<T>(config: AxiosRequestConfig): Promise<Page<T>> {
  try {
    const { data } = await http.request<Page<T>>(config);
    return { data: data.data, nextCursor: data.nextCursor };
  } catch (error) {
    throw toApiError(error);
  }
}

/** Typed calls that unwrap `{ data }` and throw `ApiError`. Features use this, never `http`. */
export const apiClient = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'GET', url }),
  /** GET of a paginated list: keeps `nextCursor` next to `data`. */
  getPage: <T>(url: string, config?: AxiosRequestConfig) =>
    requestPage<T>({ ...config, method: 'GET', url }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PUT', url, data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data }),
  delete: <T = void>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
};
