import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout/Layout';
import { LoadingFallback } from './components/LoadingFallback';
import { Toaster } from './components/ui/sonner';

// Lazy load route components for code splitting and better performance
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Alerts = lazy(() => import('./pages/Alerts').then((m) => ({ default: m.Alerts })));
const ArrMonitoring = lazy(() =>
  import('./pages/ArrMonitoring').then((m) => ({ default: m.ArrMonitoring })),
);
const Containers = lazy(() =>
  import('./pages/Containers').then((m) => ({ default: m.Containers })),
);
const FeatureFlags = lazy(() =>
  import('./pages/FeatureFlags').then((m) => ({ default: m.FeatureFlags })),
);
const Pools = lazy(() => import('./pages/Pools').then((m) => ({ default: m.Pools })));
const Security = lazy(() => import('./pages/Security').then((m) => ({ default: m.Security })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Layout>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pools" element={<Pools />} />
              <Route path="/containers" element={<Containers />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/security" element={<Security />} />
              <Route path="/arr" element={<ArrMonitoring />} />
              <Route path="/feature-flags" element={<FeatureFlags />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
        <Toaster />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
