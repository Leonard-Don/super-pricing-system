import { useEffect } from 'react';

function useQuantLabInfrastructureForms({
  authPolicyForm,
  infrastructureStatus,
  mountedInfrastructure,
  persistenceBootstrapForm,
  persistenceMigrationForm,
  rateLimitForm,
}) {
  useEffect(() => {
    if (!mountedInfrastructure || !infrastructureStatus?.rate_limits) {
      return;
    }
    rateLimitForm.setFieldsValue({
      default_requests_per_minute: infrastructureStatus.rate_limits.default_rule?.requests_per_minute || 100,
      default_burst_size: infrastructureStatus.rate_limits.default_rule?.burst_size || 120,
      rules_json: JSON.stringify(infrastructureStatus.rate_limits.rules || [], null, 2),
    });
  }, [infrastructureStatus, mountedInfrastructure, rateLimitForm]);

  useEffect(() => {
    if (!mountedInfrastructure || !infrastructureStatus?.auth) {
      return;
    }
    authPolicyForm.setFieldsValue({
      required: infrastructureStatus.auth.required,
    });
  }, [authPolicyForm, infrastructureStatus, mountedInfrastructure]);

  useEffect(() => {
    if (!mountedInfrastructure) {
      return;
    }
    persistenceBootstrapForm.setFieldsValue({
      enable_timescale_schema: true,
    });
  }, [mountedInfrastructure, persistenceBootstrapForm]);

  useEffect(() => {
    if (!mountedInfrastructure) {
      return;
    }
    persistenceMigrationForm.setFieldsValue({
      sqlite_path: '',
      dry_run: true,
      include_records: true,
      include_timeseries: true,
      dedupe_timeseries: true,
      record_limit: undefined,
      timeseries_limit: undefined,
    });
  }, [mountedInfrastructure, persistenceMigrationForm]);
}

export default useQuantLabInfrastructureForms;
