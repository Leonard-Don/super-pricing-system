import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  QuantLabAlertOrchestrationPanel,
  QuantLabDataQualityPanel,
  QuantLabTradingJournalPanel,
} from '../components/quant-lab/QuantLabOpsSections';

const noop = jest.fn();

describe('QuantLabOpsSections', () => {
  test('renders empty states for each ops section without data', () => {
    render(
      <>
        <QuantLabTradingJournalPanel
          tradingJournal={null}
          onSaveTradeNote={noop}
          onAddLifecycleEntry={noop}
          formatPct={(value) => `${value}`}
          formatMoney={(value) => `$${value}`}
          formatDateTime={(value) => String(value || '--')}
          lifecycleStageColor={() => 'blue'}
          lifecycleStatusColor={() => 'green'}
        />
        <QuantLabAlertOrchestrationPanel
          alertOrchestration={null}
          onAddCompositeRule={noop}
          onPublishAlertEvent={noop}
          onReviewAlertHistory={noop}
          formatPct={(value) => `${value}`}
          formatDateTime={(value) => String(value || '--')}
        />
        <QuantLabDataQualityPanel
          dataQuality={null}
          formatPct={(value) => `${value}`}
          formatDateTime={(value) => String(value || '--')}
        />
      </>
    );

    expect(screen.getByText('交易日志与绩效追踪')).toBeInTheDocument();
    expect(screen.getByText('智能告警编排中心')).toBeInTheDocument();
    expect(screen.getByText('数据质量可观测平台')).toBeInTheDocument();
    expect(screen.getByText('暂无交易日志数据')).toBeInTheDocument();
    expect(screen.getByText('暂无告警编排数据')).toBeInTheDocument();
    expect(screen.getByText('暂无数据质量快照')).toBeInTheDocument();
  });
});
