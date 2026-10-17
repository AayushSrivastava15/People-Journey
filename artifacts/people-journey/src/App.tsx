import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { LandingPage } from '@/pages/landing-page';
import { LoginPlaceholder } from '@/pages/login-placeholder';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const DashboardPage = lazy(async () => {
  const module = await import('@/pages/dashboard');
  return { default: module.DashboardPage };
});

function DashboardRoute() {
  return (
    <Suspense fallback={<div className="min-h-[40vh] p-8 text-sm text-[#81747d]" role="status">Loading demo workspace…</div>}>
      <DashboardPage />
    </Suspense>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={LoginPlaceholder} />
        <Route path="/dashboard" component={DashboardRoute} />
        <Route path="/dashboard/employees" component={DashboardRoute} />
        <Route path="/dashboard/add-employee" component={DashboardRoute} />
        <Route path="/dashboard/schedule-offboarding" component={DashboardRoute} />
        <Route path="/dashboard/onboarding" component={DashboardRoute} />
        <Route path="/dashboard/offboarding" component={DashboardRoute} />
        <Route path="/dashboard/departments" component={DashboardRoute} />
        <Route path="/dashboard/notifications" component={DashboardRoute} />
        <Route path="/dashboard/templates" component={DashboardRoute} />
        <Route path="/dashboard/notification-history" component={DashboardRoute} />
        <Route path="/dashboard/exit-interviews" component={DashboardRoute} />
        <Route path="/dashboard/interview-responses" component={DashboardRoute} />
        <Route path="/dashboard/hr-users" component={DashboardRoute} />
        <Route path="/dashboard/settings" component={DashboardRoute} />
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
