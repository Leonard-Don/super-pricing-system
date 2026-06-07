import { describe, it, expect } from 'vitest';
import { commandChartTheme } from '@/components/command/chartTheme';

describe('commandChartTheme', () => {
  it('exposes grid/axis/series tokens', () => {
    expect(commandChartTheme.grid).toMatch(/#|rgba/);
    expect(commandChartTheme.axis).toMatch(/#|rgba/);
    expect(commandChartTheme.series.amber).toMatch(/#|rgba/);
    expect(commandChartTheme.series.blue).toMatch(/#|rgba/);
  });
});
