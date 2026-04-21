import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../components/quant-lab/QuantLabOpsSections', () => ({
  QuantLabTradingJournalPanel: () => <div data-testid="ops-trading-journal-section" />,
  QuantLabAlertOrchestrationPanel: () => <div data-testid="ops-alert-section" />,
  QuantLabDataQualityPanel: () => <div data-testid="ops-data-quality-section" />,
}));

import QuantLabOpsPanel from '../components/quant-lab/QuantLabOpsPanel';

const noop = jest.fn();

describe('QuantLabOpsPanel', () => {
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
    if (!window.ResizeObserver) {
      window.ResizeObserver = class ResizeObserver {
        observe() {}

        unobserve() {}

        disconnect() {}
      };
    }
    if (!global.ResizeObserver) {
      global.ResizeObserver = window.ResizeObserver;
    }
  });

  test('composes the split operations sections', () => {
    render(
      <QuantLabOpsPanel
        alertOrchestration={null}
        dataQuality={null}
        formatDateTime={(value) => String(value || '--')}
        formatMoney={(value) => `$${value}`}
        formatPct={(value) => `${value}`}
        lifecycleStageColor={() => 'blue'}
        lifecycleStatusColor={() => 'green'}
        loading={false}
        onAddCompositeRule={noop}
        onAddLifecycleEntry={noop}
        onPublishAlertEvent={noop}
        onReload={noop}
        onReviewAlertHistory={noop}
        onSaveTradeNote={noop}
        tradingJournal={null}
      />
    );

    expect(screen.getByRole('button', { name: /刷新运营面板/ })).toBeInTheDocument();
    expect(screen.getByTestId('ops-trading-journal-section')).toBeInTheDocument();
    expect(screen.getByTestId('ops-alert-section')).toBeInTheDocument();
    expect(screen.getByTestId('ops-data-quality-section')).toBeInTheDocument();
  });
});
