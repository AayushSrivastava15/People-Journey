/**
 * Centralized API Client Configuration
 * Automatically attaches Firebase Bearer token for authenticated requests.
 * Provides clean error parsing, timeout handling, and type safety.
 */

import { auth } from '../lib/firebase';

/**
 * Normalizes the API base URL to ensure:
 * 1. Trailing slashes are stripped.
 * 2. The canonical '/api' prefix is always included, even if the environment variable
 *    only specifies the backend host (e.g. 'https://people-journey.onrender.com').
 */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').trim().replace(/\/+$/, '');
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

/**
 * Constructs a normalized, canonical URL for an API endpoint, preventing
 * double '/api/api' or missing '/api' segments.
 */
export function buildApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const path = cleanEndpoint.startsWith('api/') ? cleanEndpoint.slice(4) : cleanEndpoint;
  return `${base}/${path}`;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = buildApiUrl(endpoint);

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Automatically attach Firebase ID Token if user is authenticated and header is missing
  if (!headers.has('Authorization') && auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (err) {
      console.warn('Could not acquire Firebase ID token:', err);
    }
  }

  // Request timeout protection (30s default)
  let controller: AbortController | undefined;
  let signal = options.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (!signal && typeof AbortController !== 'undefined') {
    controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => controller?.abort(), 30000);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = response.statusText;
      let errorData: unknown = null;

      try {
        errorData = await response.json();
        if (typeof errorData === 'object' && errorData !== null) {
          const errObj = errorData as Record<string, unknown>;
          const nestedError = errObj.error as Record<string, unknown> | undefined;
          errorMessage = (errObj.message as string) || (nestedError?.message as string) || (typeof errObj.error === 'string' ? errObj.error : '') || errorMessage;
        }
      } catch {
        try {
          const text = await response.text();
          if (text) errorMessage = text;
        } catch {
          // Fallback to status text
        }
      }

      throw new ApiError(errorMessage || `Request failed with status ${response.status}`, response.status, errorData);
    }

    // Handle empty 204 or non-JSON responses
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check your connection and try again.', 408);
    }
    throw err;
  }
}
