import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import LoginPage from '@/routes/auth/LoginPage';
import { PricingLayout } from '@/routes/pricing/PricingLayout';

// eslint-disable-next-line react-refresh/only-export-components
const PricingAnalysisPage = lazy(() => import('@/routes/pricing/PricingAnalysisPage'));
// eslint-disable-next-line react-refresh/only-export-components
const ValuationLabPage = lazy(() => import('@/routes/pricing/ValuationLabPage'));
// eslint-disable-next-line react-refresh/only-export-components
const FactorLabPage = lazy(() => import('@/routes/pricing/FactorLabPage'));
// eslint-disable-next-line react-refresh/only-export-components
const GodeyePage = lazy(() => import('@/routes/godeye/GodeyePage'));
// eslint-disable-next-line react-refresh/only-export-components
const WorkbenchPage = lazy(() => import('@/routes/workbench/WorkbenchPage'));

const lazyEl = (El: ComponentType) => (
  <Suspense fallback={<div className="p-6 text-muted-foreground">加载中…</div>}>
    <El />
  </Suspense>
);

export const router = createBrowserRouter([
  // Login is optional: the backend does not enforce auth (anonymous requests are
  // served), so the app opens directly into the workspaces. /login remains
  // available for users who want a session; a real token still drives the
  // auth-refresh / session-expiry redirect in services/api/core.ts.
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/pricing" replace /> },
      {
        path: 'pricing',
        element: <PricingLayout />,
        children: [
          { index: true, element: lazyEl(PricingAnalysisPage) },
          { path: 'valuation', element: lazyEl(ValuationLabPage) },
          { path: 'factors', element: lazyEl(FactorLabPage) },
        ],
      },
      { path: 'godeye', element: lazyEl(GodeyePage) },
      { path: 'workbench', element: lazyEl(WorkbenchPage) },
    ],
  },
]);
