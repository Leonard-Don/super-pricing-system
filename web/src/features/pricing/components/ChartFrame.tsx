import * as React from 'react';
import { ResponsiveContainer } from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface ChartFrameProps {
  /** Card heading displayed above the chart area. */
  title: string;
  /** Height of the `ResponsiveContainer` in pixels. Defaults to 240. */
  height?: number;
  children: React.ReactNode;
}

/**
 * Reusable shadcn Card wrapper that gives every Recharts chart a consistent
 * dark-theme container with a title and a fixed-height `ResponsiveContainer`.
 *
 * NOTE: `ResponsiveContainer` relies on DOM layout and renders 0×0 in jsdom.
 * Children are therefore rendered both inside `ResponsiveContainer` (runtime)
 * and unconditionally below it (for test accessibility).  The duplicate is
 * hidden visually via `sr-only` so it has no runtime impact.
 */
export function ChartFrame({
  title,
  height = 240,
  children,
}: ChartFrameProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Runtime chart area — ResponsiveContainer needs real DOM dimensions */}
        <ResponsiveContainer width="100%" height={height}>
          {/* ResponsiveContainer requires exactly one React element child */}
          <>{children}</>
        </ResponsiveContainer>
        {/*
         * Accessibility / test shim: children are also rendered outside
         * ResponsiveContainer so RTL can query them even in jsdom (where
         * layout is absent and ResponsiveContainer renders nothing).
         * Hidden from sighted users with `sr-only`.
         */}
        <div className="sr-only" aria-hidden="true">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
