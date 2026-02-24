import { ADMIN_TOOLS_HOSTNAME } from '@/config';
import { getToken } from '@/utils/auth';

export class AdminToolsApiError extends Error {
  constructor(
    public message: string,
    public status: number,
    public rawError?: unknown
  ) {
    super(message);
  }
}

type HttpMethod = 'GET' | 'POST' | 'DELETE';

const request = async <T>(
  endpoint: string,
  options?: {
    body?: unknown;
    method?: HttpMethod;
    headers?: HeadersInit;
    signal?: AbortSignal;
  }
): Promise<T> => {
  const { body, headers, method = 'GET', signal } = options || {};

  try {
    const jwt = await getToken();
    const config: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      signal,
    };

    if (body) {
      if (body instanceof FormData) {
        config.body = body;
        delete (config.headers as Record<string, string>)['Content-Type'];
      } else {
        config.body = JSON.stringify(body);
      }
    }

    const baseUrl = ADMIN_TOOLS_HOSTNAME;
    const response = await fetch(`${baseUrl}${endpoint}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new AdminToolsApiError(parseErrorMessage(errorData), response.status, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AdminToolsApiError) {
      throw error;
    }

    if (typeof error === 'object' && error && 'message' in error) {
      throw new Error(`Admin Tools API error: ${error.message}`);
    }

    throw new Error(`Admin Tools API error: ${JSON.stringify(error)}`);
  }
};

/**
 * Fetch a binary blob from admin-tools (e.g. backup file download).
 */
const requestBlob = async (
  endpoint: string,
  options?: { signal?: AbortSignal }
): Promise<Blob> => {
  const jwt = await getToken();
  const response = await fetch(`${ADMIN_TOOLS_HOSTNAME}${endpoint}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt}` },
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new AdminToolsApiError(parseErrorMessage(errorData), response.status, errorData);
  }

  return response.blob();
};

export const adminGet = <T>(endpoint: string, { signal }: { signal?: AbortSignal } = {}) =>
  request<T>(endpoint, { method: 'GET', signal });

export const adminPost = <T>(endpoint: string, { body, signal }: { body?: unknown; signal?: AbortSignal } = {}) =>
  request<T>(endpoint, { method: 'POST', body, signal });

export const adminDel = <T>(endpoint: string, { signal }: { signal?: AbortSignal } = {}) =>
  request<T>(endpoint, { method: 'DELETE', signal });

export const adminDownload = (endpoint: string, { signal }: { signal?: AbortSignal } = {}) =>
  requestBlob(endpoint, { signal });

function parseErrorMessage(errorData: any): string {
  const DEFAULT_ERROR = 'Admin Tools API error';

  if (!errorData?.message) {
    return DEFAULT_ERROR;
  }

  if (typeof errorData.message === 'string') {
    return errorData.message;
  }

  return errorData.message?.message || DEFAULT_ERROR;
}
