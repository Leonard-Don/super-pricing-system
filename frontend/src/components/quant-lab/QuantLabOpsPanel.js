import React from 'react';
import {
  Button,
  Col,
  Row,
  Space,
  Spin,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  QuantLabAlertOrchestrationPanel,
  QuantLabDataQualityPanel,
  QuantLabTradingJournalPanel,
} from './QuantLabOpsSections';

const FULL_WIDTH_STYLE = { width: '100%' };

const QuantLabOpsPanel = ({
  alertOrchestration,
  dataQuality,
  formatDateTime,
  formatMoney,
  formatPct,
  lifecycleStageColor,
  lifecycleStatusColor,
  loading,
  onAddCompositeRule,
  onAddLifecycleEntry,
  onPublishAlertEvent,
  onReload,
  onReviewAlertHistory,
  onSaveTradeNote,
  tradingJournal,
}) => (
  <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
    <Space>
      <Button icon={<ReloadOutlined />} onClick={onReload} loading={loading}>刷新运营面板</Button>
    </Space>
    {loading ? <Spin size="large" /> : null}
    {!loading ? (
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <QuantLabTradingJournalPanel
            tradingJournal={tradingJournal}
            onSaveTradeNote={onSaveTradeNote}
            onAddLifecycleEntry={onAddLifecycleEntry}
            formatPct={formatPct}
            formatMoney={formatMoney}
            formatDateTime={formatDateTime}
            lifecycleStageColor={lifecycleStageColor}
            lifecycleStatusColor={lifecycleStatusColor}
          />
        </Col>
        <Col xs={24} xl={12}>
          <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
            <QuantLabAlertOrchestrationPanel
              alertOrchestration={alertOrchestration}
              onAddCompositeRule={onAddCompositeRule}
              onPublishAlertEvent={onPublishAlertEvent}
              onReviewAlertHistory={onReviewAlertHistory}
              formatPct={formatPct}
              formatDateTime={formatDateTime}
            />
            <QuantLabDataQualityPanel
              dataQuality={dataQuality}
              formatPct={formatPct}
              formatDateTime={formatDateTime}
            />
          </Space>
        </Col>
      </Row>
    ) : null}
  </Space>
);

export default QuantLabOpsPanel;
