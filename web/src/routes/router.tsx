import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/components/RequireAuth';
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
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
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
