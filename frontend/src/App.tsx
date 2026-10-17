import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { LandingPage } from '@/pages/landing-page';
import { LoginPage } from '@/pages/login-page';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const DashboardPage = lazy(async () => {
  const module = await import('@/pages/dashboard');
  return { default: module.DashboardPage };
});

function DashboardRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh] p-8 text-sm text-[#81747d]" role="status">Loading workspace…</div>}>
      <DashboardPage />
    </Suspense>
  );
}

function ProtectedDashboardRoute() {
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
        <Route path="/login" component={LoginPage} />
        <Route path="/dashboard" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/employees" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/add-employee" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/schedule-offboarding" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/onboarding" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/offboarding" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/departments" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/notifications" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/templates" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/notification-history" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/exit-interviews" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/interview-responses" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/hr-users" component={ProtectedDashboardRoute} />
        <Route path="/dashboard/settings" component={ProtectedDashboardRoute} />
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
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
