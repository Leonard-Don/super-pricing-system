import buildQuantLabExperimentTabs from './buildQuantLabExperimentTabs';
import buildQuantLabSupportTabs from './buildQuantLabSupportTabs';

const buildQuantLabTabs = (params) => ([
  ...buildQuantLabExperimentTabs(params),
  ...buildQuantLabSupportTabs(params),
]);

export default buildQuantLabTabs;
