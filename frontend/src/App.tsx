import { useEffect, lazy, Suspense, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/query-client';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { CookieConsentBanner } from '@/components/cookie-consent-banner';
import { SessionInactivityTracker } from '@/components/session-inactivity-tracker';
import { useAuth } from '@/context';
import { DashboardShellSkeleton } from '@/components/dashboard-skeletons';
import { getStoredPreferences, getDefaultLandingPath } from '@/utils/workspace-preferences';


const LandingPage = lazy(async () => {
  const module = await import('@/pages/landing-page');
  return { default: module.LandingPage };
});

const LoginPage = lazy(async () => {
  const module = await import('@/pages/login-page');
  return { default: module.LoginPage };
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

function LandingRoute() {
  const [, setLocation] = useLocation();
  const { user, appUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && (user || appUser)) {
      const stored = getStoredPreferences();
      const defaultView = (appUser?.preferences?.defaultView as string) || stored.defaultView;
      const target = getDefaultLandingPath(defaultView);
      setLocation(target, { replace: true });
    }
  }, [user, appUser, loading, setLocation]);

  return (
    <Suspense fallback={<RouteFallback label="Loading People Journey…" />}>
      <LandingPage />
    </Suspense>
  );
}

function LoginRoute() {
  return (
    <Suspense fallback={<RouteFallback label="Loading login…" />}>
      <LoginPage />
    </Suspense>
  );
}

function DashboardRoute() {
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <DashboardPage />
    </Suspense>
  );
}


function ShortLinkRoute() {
  return (
    <Suspense fallback={<RouteFallback label="Opening feedback survey…" />}>
      <ShortLinkRedirectPage />
    </Suspense>
  );
}

function IndexHtmlRedirect() {
  const [, setLocation] = useLocation();
  const { user, appUser, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user || appUser) {
        setLocation('/dashboard', { replace: true });
      } else {
        setLocation('/', { replace: true });
      }
    }
  }, [user, appUser, loading, setLocation]);

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
        <Route path="/" component={LandingRoute} />
        <Route path="/index.html" component={IndexHtmlRedirect} />
        <Route path="/login" component={LoginRoute} />
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
        <Route path="/e/:code" component={ShortLinkRoute} />
        <Route path="/e/:code/" component={ShortLinkRoute} />
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
