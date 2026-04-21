import { Form } from 'antd';

function useQuantLabForms() {
  const [optimizerForm] = Form.useForm();
  const [riskForm] = Form.useForm();
  const [valuationForm] = Form.useForm();
  const [rotationForm] = Form.useForm();
  const [factorForm] = Form.useForm();
  const [monteCarloForm] = Form.useForm();
  const [significanceForm] = Form.useForm();
  const [multiPeriodForm] = Form.useForm();
  const [impactAnalysisForm] = Form.useForm();
  const [industryIntelForm] = Form.useForm();
  const [signalValidationForm] = Form.useForm();
  const [marketProbeForm] = Form.useForm();
  const [configVersionForm] = Form.useForm();
  const [configLookupForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [tokenForm] = Form.useForm();
  const [authUserForm] = Form.useForm();
  const [authLoginForm] = Form.useForm();
  const [oauthProviderForm] = Form.useForm();
  const [oauthExchangeForm] = Form.useForm();
  const [authPolicyForm] = Form.useForm();
  const [rateLimitForm] = Form.useForm();
  const [persistenceRecordForm] = Form.useForm();
  const [timeseriesForm] = Form.useForm();
  const [persistenceQueryForm] = Form.useForm();
  const [persistenceBootstrapForm] = Form.useForm();
  const [persistenceMigrationForm] = Form.useForm();
  const [notificationForm] = Form.useForm();
  const [notificationChannelForm] = Form.useForm();

  return {
    authLoginForm,
    authPolicyForm,
    authUserForm,
    configLookupForm,
    configVersionForm,
    factorForm,
    impactAnalysisForm,
    industryIntelForm,
    marketProbeForm,
    monteCarloForm,
    multiPeriodForm,
    notificationChannelForm,
    notificationForm,
    oauthExchangeForm,
    oauthProviderForm,
    optimizerForm,
    persistenceBootstrapForm,
    persistenceMigrationForm,
    persistenceQueryForm,
    persistenceRecordForm,
    rateLimitForm,
    riskForm,
    rotationForm,
    signalValidationForm,
    significanceForm,
    taskForm,
    timeseriesForm,
    tokenForm,
    valuationForm,
  };
}

export default useQuantLabForms;
