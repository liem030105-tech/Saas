import { ErrorResponseSchema, type ErrorCode, type ErrorDetail } from '@trello-clone/shared';
import axios, { type AxiosRequestConfig } from 'axios';

import { env } from '@/config/env';

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

// The single axios instance. The refresh-token interceptor is added in AUTH-003.
export const http = axios.create({ baseURL: env.VITE_API_URL, withCredentials: true });

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await http.request<{ data: T } | ''>(config);
    // 204 No Content has no body.
    return (response.data === '' ? undefined : response.data.data) as T;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Typed calls that unwrap `{ data }` and throw `ApiError`. Features use this, never `http`. */
export const apiClient = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'GET', url }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PUT', url, data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data }),
  delete: <T = void>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
};
