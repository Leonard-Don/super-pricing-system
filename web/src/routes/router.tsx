import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';

// eslint-disable-next-line react-refresh/only-export-components
const PricingPage = lazy(() => import('@/routes/pricing/PricingPage'));
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
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/pricing" replace /> },
      { path: 'pricing', element: lazyEl(PricingPage) },
      { path: 'godeye', element: lazyEl(GodeyePage) },
      { path: 'workbench', element: lazyEl(WorkbenchPage) },
    ],
  },
]);
