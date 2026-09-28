import axios, { type AxiosRequestConfig } from 'axios';

import { env } from '@/config/env';

// Canonical error envelope (docs/api/README.md). The codes move to @trello-clone/shared in FOUNDATION-005.
export interface ApiErrorDetail {
  path?: string;
  message: string;
  [key: string]: unknown;
}

interface ErrorEnvelope {
  error: { code: string; message: string; details: ApiErrorDetail[]; requestId?: string };
}

/** Code used when the response is not the canonical error (network failure, proxy HTML, …). */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message);
  }
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const { error } = body as { error: unknown };
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const body: unknown = error.response?.data;
    if (isErrorEnvelope(body)) {
      const { code, message, details, requestId } = body.error;
      return new ApiError(status, code, message, Array.isArray(details) ? details : [], requestId);
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
