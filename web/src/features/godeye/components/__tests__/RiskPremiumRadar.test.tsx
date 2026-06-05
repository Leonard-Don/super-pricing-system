import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskPremiumRadar } from '../RiskPremiumRadar';
import type { RadarItem } from '@/features/godeye/lib/overviewViewModels';

const minimalRadarData: RadarItem[] = [
  {
    factor: '库存压力',
    intensity: 68,
    confidence: 75,
    rawValue: 0.42,
    zScore: 1.2,
    signal: 1,
  },
  {
    factor: '贸易脉冲',
    intensity: 45,
    confidence: 60,
    rawValue: 0.18,
    zScore: 0.5,
    signal: 0,
  },
];

describe('RiskPremiumRadar', () => {
  it('renders the ChartFrame title', () => {
    render(
      <RiskPremiumRadar
        radarData={minimalRadarData}
        macroScore={0.1234}
        confidence={0.82}
        macroSignal={1}
      />
    );
    expect(screen.getByText('风险溢价雷达')).toBeDefined();
  });

  it('renders the macroScore', () => {
    render(
      <RiskPremiumRadar
        radarData={minimalRadarData}
        macroScore={0.1234}
        confidence={0.82}
        macroSignal={1}
      />
    );
    expect(screen.getByText(/0\.1234/)).toBeDefined();
  });

  it('renders the macro signal label', () => {
    render(
      <RiskPremiumRadar
        radarData={minimalRadarData}
        macroScore={0.1234}
        confidence={0.82}
        macroSignal={1}
      />
    );
    // signal=1 → '猎杀窗口'
    expect(screen.getByText('猎杀窗口')).toBeDefined();
  });

  it('renders confidence display', () => {
    render(
      <RiskPremiumRadar
        radarData={minimalRadarData}
        macroScore={0.1234}
        confidence={0.82}
        macroSignal={1}
      />
    );
    expect(screen.getByText(/置信度.*0\.82/)).toBeDefined();
  });

  it('renders factor count', () => {
    render(
      <RiskPremiumRadar
        radarData={minimalRadarData}
        macroScore={0.1234}
        confidence={0.82}
        macroSignal={1}
      />
    );
    expect(screen.getByText(/因子数量.*2/)).toBeDefined();
  });

  it('renders 暂无雷达数据 when radarData is empty', () => {
    render(
      <RiskPremiumRadar
        radarData={[]}
        macroScore={0}
        confidence={0}
        macroSignal={0}
      />
    );
    expect(screen.getByText('暂无雷达数据')).toBeDefined();
  });

  it('renders default 观察中 signal label when signal=0', () => {
    render(
      <RiskPremiumRadar
        radarData={minimalRadarData}
        macroScore={0}
        confidence={0.5}
        macroSignal={0}
      />
    );
    expect(screen.getByText('观察中')).toBeDefined();
  });

  it('renders 逆风区 when macroSignal is -1', () => {
    render(
      <RiskPremiumRadar
        radarData={minimalRadarData}
        macroScore={-0.05}
        confidence={0.6}
        macroSignal={-1}
      />
    );
    expect(screen.getByText('逆风区')).toBeDefined();
  });
});
