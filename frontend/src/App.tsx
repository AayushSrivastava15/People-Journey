import { useEffect, lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { LandingPage } from '@/pages/landing-page';
import { LoginPage } from '@/pages/login-page';
import { CookieConsentBanner } from '@/components/cookie-consent-banner';
import { SessionInactivityTracker } from '@/components/session-inactivity-tracker';
import { useAuth } from '@/context';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 60 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false, // Prevent redundant background fetches
      retry: 1,
    },
  },
});

const DashboardPage = lazy(async () => {
  const module = await import('@/pages/dashboard');
  return { default: module.DashboardPage };
});

const ShortLinkRedirectPage = lazy(async () => {
  const module = await import('@/pages/short-link-redirect');
  return { default: module.ShortLinkRedirectPage };
});

function RouteFallback({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh', color: '#887582', fontSize: '13px' }} role="status">
      {label}
    </div>
  );
}

function DashboardRoute() {
  return (
    <Suspense fallback={<RouteFallback label="Loading workspace…" />}>
      <DashboardPage />
    </Suspense>
  );
}

function IndexHtmlRedirect() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        setLocation('/dashboard', { replace: true });
      } else {
        setLocation('/', { replace: true });
      }
    }
  }, [user, loading, setLocation]);

  return <RouteFallback label="Opening workspace…" />;
}

function ProtectedWorkspaceRoute() {
  return (
    <ProtectedRoute>
      <DashboardRoute />
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/index.html" component={IndexHtmlRedirect} />
        <Route path="/login" component={LoginPage} />
        <Route path="/dashboard" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/overview" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/settings" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/employees" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/add-employee" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/schedule-offboarding" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/onboarding" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/offboarding" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/departments" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/notifications" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/templates" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/notification-history" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/exit-interviews" component={ProtectedWorkspaceRoute} />
        <Route path="/dashboard/interview-responses" component={ProtectedWorkspaceRoute} />
        <Route path="/e/:code" component={() => <Suspense fallback={<RouteFallback label="Opening feedback survey…" />}><ShortLinkRedirectPage /></Suspense>} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
          <SessionInactivityTracker />
          <CookieConsentBanner />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
