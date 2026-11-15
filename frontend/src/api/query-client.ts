import { QueryClient } from '@tanstack/react-query';

/**
 * Shared QueryClient instance for TanStack Query.
 * Exported so that authentication and session lifecycle handlers can safely
 * clear cached workspace, employee, and notification data upon user sign-out
 * or cross-tab session termination.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 60 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false, // Prevent redundant background fetches
      retry: 1,
    },
  },
});
