import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import GodEyeHeader from '../components/GodEyeDashboard/GodEyeHeader';

describe('GodEyeHeader', () => {
  beforeAll(() => {
    const matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMedia,
    });
    Object.defineProperty(global, 'matchMedia', {
      writable: true,
      value: matchMedia,
    });
  });

  it('keeps the top-level entry focused on pricing and removes the cross-market CTA', () => {
    render(
      <GodEyeHeader
        handleManualRefresh={jest.fn()}
        macroSignal={0}
        navigateTo={jest.fn()}
        refreshing={false}
      />
    );

    expect(screen.getByText('宏观错价指挥台')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开定价剧本' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开跨市场剧本' })).not.toBeInTheDocument();
  });
});
