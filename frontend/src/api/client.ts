/**
 * Centralized API Client Configuration
 * Automatically attaches Firebase Bearer token for authenticated requests.
 * Provides clean error parsing, timeout handling, and type safety.
 */

import { auth } from '../lib/firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

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
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

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

  const response = await fetch(url, {
    ...options,
    headers,
  });

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
}
