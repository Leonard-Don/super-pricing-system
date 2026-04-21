const buildConfigDiffRows = (configDiff) => (
  Array.isArray(configDiff?.changes)
    ? configDiff.changes.map((item, index) => ({ ...item, key: `${item.path}-${index}` }))
    : []
);

const buildConfigVersionRows = (configVersions) => (
  Array.isArray(configVersions)
    ? configVersions.map((item) => ({ ...item, key: item.id }))
    : []
);

const buildInfrastructureTaskRows = (infrastructureTasks) => (
  Array.isArray(infrastructureTasks)
    ? infrastructureTasks.map((item) => ({ ...item, key: item.id }))
    : []
);

const buildQuantLabInfrastructureTables = ({
  configDiff,
  configVersions,
  infrastructureTasks,
}) => ({
  configDiffRows: buildConfigDiffRows(configDiff),
  configVersionRows: buildConfigVersionRows(configVersions),
  infrastructureTaskRows: buildInfrastructureTaskRows(infrastructureTasks),
});

export default buildQuantLabInfrastructureTables;
