import React from 'react';
import {
  CodeOutlined,
  FundOutlined,
} from '@ant-design/icons';
import QuantLabFactorPanel from './QuantLabFactorPanel';
import QuantLabValuationPanel from './QuantLabValuationPanel';
import { QUANT_LAB_TAB_META_MAP, getQuantLabBoundaryMeta } from './quantLabShared';

const QuantLabTabLabel = ({ icon: Icon, metaKey }) => {
  const meta = QUANT_LAB_TAB_META_MAP[metaKey];
  const boundary = getQuantLabBoundaryMeta(meta.boundary);
  return (
    <span className="quantlab-tab-label">
      <Icon />
      <span>{meta.title}</span>
      <span className={`quantlab-tab-label__boundary quantlab-tab-label__boundary--${boundary.tone}`}>
        {boundary.label}
      </span>
    </span>
  );
};

const buildQuantLabExperimentTabs = ({
  actionBundles,
  experimentState,
  forms,
  helpers,
}) => {
  const {
    handleFactorExpression,
    handleQueueFactorExpression,
    handleQueueValuation,
    handleValuationAnalysis,
  } = actionBundles.experimentActions;
  const {
    factorLoading,
    factorResult,
    queuedTaskLoading,
    valuationLoading,
    valuationResult,
  } = experimentState;
  const {
    formatMoney,
    formatPct,
    formatSignedPct,
    periodOptions,
  } = helpers;

  return [
    {
      key: 'valuation',
      label: <QuantLabTabLabel icon={FundOutlined} metaKey="valuation" />,
      children: (
        <QuantLabValuationPanel
          formatMoney={formatMoney}
          formatPct={formatPct}
          formatSignedPct={formatSignedPct}
          handleQueueValuation={handleQueueValuation}
          handleValuationAnalysis={handleValuationAnalysis}
          periodOptions={periodOptions}
          queueLoading={Boolean(queuedTaskLoading.valuation)}
          valuationForm={forms.valuationForm}
          valuationLoading={valuationLoading}
          valuationResult={valuationResult}
        />
      ),
    },
    {
      key: 'factor',
      label: <QuantLabTabLabel icon={CodeOutlined} metaKey="factor" />,
      children: (
        <QuantLabFactorPanel
          factorForm={forms.factorForm}
          factorLoading={factorLoading}
          factorQueueLoading={Boolean(queuedTaskLoading.factor)}
          factorResult={factorResult}
          handleFactorExpression={handleFactorExpression}
          handleQueueFactorExpression={handleQueueFactorExpression}
          periodOptions={periodOptions}
        />
      ),
    },
  ];
};

export default buildQuantLabExperimentTabs;
