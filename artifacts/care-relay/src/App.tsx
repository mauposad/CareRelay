import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { AppLayout } from './components/shared/AppLayout';
import Home from './pages/Home';
import DashboardRouter from './pages/DashboardRouter';
import SettingsPage from './pages/SettingsPage';
import DocumentsPage from './pages/DocumentsPage';
import AuthPage from './pages/AuthPage';
import RecordsPage from './pages/RecordsPage';
import { AuthProvider, useAuth } from './store/AuthContext';
import { CareProvider } from './store/CareContext';

const queryClient = new QueryClient();

function Router() {
  const { user, activeCircle, isLoading, error } = useAuth();
  if (isLoading) return <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground" data-testid="status-auth-loading">Restoring your secure session…</div>;
  if (!user) return <AppLayout><AuthPage /></AppLayout>;
  if (error) return <AppLayout><div className="py-20 text-center text-destructive" data-testid="status-auth-error">{error}</div></AppLayout>;
  return (
    <CareProvider key={`${user.id}:${activeCircle?.id ?? ''}`}>
      <RoutedErrorBoundary>
        <AppLayout>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/dashboard" component={DashboardRouter} />
          <Route path="/documents">
            <DocumentsPage key={`${user.id}:${activeCircle?.id ?? ''}:${activeCircle?.role ?? ''}`} />
          </Route>
          <Route path="/records" component={RecordsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </RoutedErrorBoundary>
    </CareProvider>
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
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
