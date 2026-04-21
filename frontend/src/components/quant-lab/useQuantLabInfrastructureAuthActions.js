import { useCallback } from 'react';
import {
  createInfrastructureToken,
  exchangeInfrastructureOAuthProvider,
  getInfrastructureAuthProviderDiagnostics,
  loginInfrastructureUser,
  revokeInfrastructureAuthSession,
  saveInfrastructureAuthUser,
  saveInfrastructureAuthProvider,
  setApiAuthToken,
  setApiRefreshToken,
  startInfrastructureOAuthProvider,
  syncInfrastructureAuthProvidersFromEnv,
  updateInfrastructureAuthPolicy,
  updateInfrastructureRateLimits,
} from '../../services/api';
import {
  invokeFirstDefined,
  parseOptionalJson,
} from './quantLabActionUtils';

const splitList = (value) => String(value || '')
  .split(/[\s,，]+/)
  .map((item) => item.trim())
  .filter(Boolean);

function useQuantLabInfrastructureAuthActions({
  applyAuthSession,
  authUserForm,
  loadInfrastructureAuthDirectory,
  loadInfrastructureAuthProviders,
  loadInfrastructureStatus,
  loadInfrastructure,
  message,
  oauthExchangeForm,
  setAuthSession,
  setAuthToken,
  setOauthDiagnostics,
  setOauthLaunchContext,
  setRefreshToken,
}) {
  const refreshInfrastructureOverview = useCallback(
    () => invokeFirstDefined(loadInfrastructureStatus, loadInfrastructure),
    [loadInfrastructure, loadInfrastructureStatus],
  );

  const refreshInfrastructureAuthDirectory = useCallback(
    () => Promise.all([
      refreshInfrastructureOverview(),
      loadInfrastructureAuthDirectory?.(),
    ]),
    [loadInfrastructureAuthDirectory, refreshInfrastructureOverview],
  );

  const refreshInfrastructureAuthProviders = useCallback(
    () => Promise.all([
      refreshInfrastructureOverview(),
      loadInfrastructureAuthProviders?.(),
    ]),
    [loadInfrastructureAuthProviders, refreshInfrastructureOverview],
  );

  const handleCreateToken = useCallback(async (values) => {
    try {
      const response = await createInfrastructureToken(values);
      setAuthToken(response.access_token || '');
      setApiAuthToken(response.access_token || '');
      setRefreshToken(response.refresh_token || '');
      setApiRefreshToken(response.refresh_token || '');
      setAuthSession((current) => current || { user: { subject: values.subject, role: values.role } });
      message.success('研究令牌已签发');
    } catch (error) {
      message.error(`签发令牌失败: ${error.userMessage || error.message}`);
    }
  }, [message, setAuthSession, setAuthToken, setRefreshToken]);

  const handleSaveAuthUser = useCallback(async (values) => {
    try {
      const metadata = parseOptionalJson(values.metadata);
      const scopes = splitList(values.scopes);
      await saveInfrastructureAuthUser({
        subject: values.subject,
        password: values.password || undefined,
        role: values.role,
        display_name: values.display_name,
        enabled: values.enabled !== false,
        scopes,
        metadata,
      });
      message.success('本地用户已保存');
      authUserForm.resetFields();
      authUserForm.setFieldsValue({
        role: 'researcher',
        enabled: true,
        scopes: 'quant:read quant:write',
        metadata: '{"desk": "research"}',
      });
      await refreshInfrastructureAuthDirectory();
    } catch (error) {
      message.error(`保存本地用户失败: ${error instanceof SyntaxError ? 'JSON 格式无效' : error.userMessage || error.message}`);
    }
  }, [authUserForm, message, refreshInfrastructureAuthDirectory]);

  const handleLoginInfrastructureUser = useCallback(async (values) => {
    try {
      const response = await loginInfrastructureUser(values);
      applyAuthSession(response, `已登录为 ${response.user?.display_name || response.user?.subject || values.subject}`);
      await refreshInfrastructureAuthDirectory();
    } catch (error) {
      message.error(`用户登录失败: ${error.userMessage || error.message}`);
    }
  }, [applyAuthSession, message, refreshInfrastructureAuthDirectory]);

  const handleSaveOAuthProvider = useCallback(async (values) => {
    try {
      const scopes = splitList(values.scopes);
      const defaultScopes = splitList(values.default_scopes);
      const extraParams = parseOptionalJson(values.extra_params);
      const metadata = parseOptionalJson(values.metadata);
      await saveInfrastructureAuthProvider({
        provider_id: values.provider_id,
        label: values.label,
        provider_type: values.provider_type,
        enabled: values.enabled !== false,
        client_id: values.client_id,
        client_secret: values.client_secret || undefined,
        auth_url: values.auth_url || undefined,
        token_url: values.token_url || undefined,
        userinfo_url: values.userinfo_url || undefined,
        redirect_uri: values.redirect_uri || undefined,
        frontend_origin: values.frontend_origin || (typeof window !== 'undefined' ? window.location.origin : ''),
        scopes,
        auto_create_user: values.auto_create_user !== false,
        default_role: values.default_role,
        default_scopes: defaultScopes,
        subject_field: values.subject_field || undefined,
        display_name_field: values.display_name_field || undefined,
        email_field: values.email_field || undefined,
        extra_params: extraParams,
        metadata,
      });
      message.success('OAuth Provider 已保存');
      await refreshInfrastructureAuthProviders();
    } catch (error) {
      message.error(`保存 OAuth Provider 失败: ${error instanceof SyntaxError ? 'JSON 格式无效' : error.userMessage || error.message}`);
    }
  }, [message, refreshInfrastructureAuthProviders]);

  const handleStartOAuthLogin = useCallback(async (providerId) => {
    try {
      const response = await startInfrastructureOAuthProvider(providerId, {
        frontend_origin: typeof window !== 'undefined' ? window.location.origin : '',
      });
      setOauthLaunchContext(response);
      oauthExchangeForm.setFieldsValue({
        provider_id: providerId,
        state: response.state,
        redirect_uri: response.redirect_uri,
      });
      const popup = typeof window !== 'undefined'
        ? window.open(response.authorization_url, `quant-oauth-${providerId}`, 'popup,width=720,height=820')
        : null;
      if (!popup) {
        message.warning('浏览器拦截了 OAuth 弹窗，请手动打开授权链接');
      } else {
        message.success(`已打开 ${providerId} OAuth 授权窗口`);
      }
    } catch (error) {
      message.error(`生成 OAuth 授权链接失败: ${error.userMessage || error.message}`);
    }
  }, [message, oauthExchangeForm, setOauthLaunchContext]);

  const handleExchangeOAuthCode = useCallback(async (values) => {
    try {
      const response = await exchangeInfrastructureOAuthProvider(values.provider_id, {
        code: values.code,
        state: values.state,
        redirect_uri: values.redirect_uri || undefined,
        expires_in_seconds: values.expires_in_seconds,
        refresh_expires_in_seconds: values.refresh_expires_in_seconds,
      });
      applyAuthSession(response, `OAuth 登录成功: ${response.user?.display_name || response.user?.subject || values.provider_id}`);
      await refreshInfrastructureAuthDirectory();
    } catch (error) {
      message.error(`OAuth 授权码交换失败: ${error.userMessage || error.message}`);
    }
  }, [applyAuthSession, message, refreshInfrastructureAuthDirectory]);

  const handleSyncOAuthProvidersFromEnv = useCallback(async () => {
    try {
      const response = await syncInfrastructureAuthProvidersFromEnv();
      message.success(`已从环境同步 ${response.synced_count || 0} 个 OAuth Provider`);
      await refreshInfrastructureAuthProviders();
    } catch (error) {
      message.error(`从环境同步 OAuth Provider 失败: ${error.userMessage || error.message}`);
    }
  }, [message, refreshInfrastructureAuthProviders]);

  const handleDiagnoseOAuthProvider = useCallback(async (providerId) => {
    try {
      const response = await getInfrastructureAuthProviderDiagnostics(providerId);
      setOauthDiagnostics(response);
      message.success(`已生成 ${providerId} 诊断报告`);
    } catch (error) {
      message.error(`诊断 OAuth Provider 失败: ${error.userMessage || error.message}`);
    }
  }, [message, setOauthDiagnostics]);

  const handleRevokeRefreshSession = useCallback(async (sessionId) => {
    try {
      await revokeInfrastructureAuthSession(sessionId);
      message.success('Refresh session 已撤销');
      await refreshInfrastructureAuthDirectory();
    } catch (error) {
      message.error(`撤销 session 失败: ${error.userMessage || error.message}`);
    }
  }, [message, refreshInfrastructureAuthDirectory]);

  const handleUpdateAuthPolicy = useCallback(async (values) => {
    try {
      await updateInfrastructureAuthPolicy({
        required: values.required === true,
      });
      message.success('认证策略已更新');
      await refreshInfrastructureOverview();
    } catch (error) {
      message.error(`更新认证策略失败: ${error.userMessage || error.message}`);
    }
  }, [message, refreshInfrastructureOverview]);

  const handleUpdateRateLimits = useCallback(async (values) => {
    try {
      await updateInfrastructureRateLimits({
        default_requests_per_minute: values.default_requests_per_minute,
        default_burst_size: values.default_burst_size,
        rules: parseOptionalJson(values.rules_json, []),
      });
      message.success('限流规则已更新');
      await refreshInfrastructureOverview();
    } catch (error) {
      message.error(`更新限流规则失败: ${error instanceof SyntaxError ? 'JSON 格式无效' : error.userMessage || error.message}`);
    }
  }, [message, refreshInfrastructureOverview]);

  return {
    handleCreateToken,
    handleDiagnoseOAuthProvider,
    handleExchangeOAuthCode,
    handleLoginInfrastructureUser,
    handleRevokeRefreshSession,
    handleSaveAuthUser,
    handleSaveOAuthProvider,
    handleStartOAuthLogin,
    handleSyncOAuthProvidersFromEnv,
    handleUpdateAuthPolicy,
    handleUpdateRateLimits,
  };
}

export default useQuantLabInfrastructureAuthActions;
