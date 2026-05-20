import { Form } from 'antd';

function useQuantLabForms() {
  const [valuationForm] = Form.useForm();
  const [factorForm] = Form.useForm();
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
    notificationChannelForm,
    notificationForm,
    oauthExchangeForm,
    oauthProviderForm,
    persistenceBootstrapForm,
    persistenceMigrationForm,
    persistenceQueryForm,
    persistenceRecordForm,
    rateLimitForm,
    taskForm,
    timeseriesForm,
    tokenForm,
    valuationForm,
  };
}

export default useQuantLabForms;
