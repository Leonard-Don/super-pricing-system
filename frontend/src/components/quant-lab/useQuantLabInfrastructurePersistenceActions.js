import { useCallback } from 'react';
import {
  bootstrapInfrastructurePersistence,
  cancelInfrastructureTask,
  createInfrastructureTask,
  getInfrastructurePersistenceMigrationPreview,
  getInfrastructureRecords,
  getInfrastructureTimeseries,
  runInfrastructurePersistenceMigration,
  saveInfrastructureRecord,
  saveInfrastructureTimeseries,
} from '../../services/api';
import {
  invokeFirstDefined,
  parseOptionalJson,
} from './quantLabActionUtils';

function useQuantLabInfrastructurePersistenceActions({
  loadInfrastructureStatusAndTasks,
  loadInfrastructure,
  message,
  persistenceRecordForm,
  setPersistenceBootstrapLoading,
  setPersistenceDiagnostics,
  setPersistenceMigrationLoading,
  setPersistenceMigrationPreview,
  setPersistenceRecords,
  setPersistenceTimeseries,
  taskForm,
  timeseriesForm,
}) {
  const refreshInfrastructureTasks = useCallback(
    () => invokeFirstDefined(loadInfrastructureStatusAndTasks, loadInfrastructure),
    [loadInfrastructure, loadInfrastructureStatusAndTasks],
  );

  const handleCreateTask = useCallback(async (values) => {
    try {
      const payload = parseOptionalJson(values.payload);
      const response = await createInfrastructureTask({
        name: values.name,
        payload,
        execution_backend: values.execution_backend || 'auto',
      });
      message.success('异步任务已提交');
      taskForm.resetFields();
      taskForm.setFieldsValue({
        name: values.name,
        execution_backend: values.execution_backend || 'auto',
        payload: values.payload,
      });
      if (response?.execution_backend === 'celery') {
        message.info('任务已路由到 Celery worker');
      }
      await refreshInfrastructureTasks();
    } catch (error) {
      message.error(`提交任务失败: ${error.userMessage || error.message}`);
    }
  }, [message, refreshInfrastructureTasks, taskForm]);

  const handleCancelTask = useCallback(async (taskId) => {
    try {
      await cancelInfrastructureTask(taskId);
      message.success('任务取消请求已提交');
      await refreshInfrastructureTasks();
    } catch (error) {
      message.error(`取消任务失败: ${error.userMessage || error.message}`);
    }
  }, [message, refreshInfrastructureTasks]);

  const handleSavePersistenceRecord = useCallback(async (values) => {
    try {
      const payload = parseOptionalJson(values.payload);
      await saveInfrastructureRecord({
        record_type: values.record_type,
        record_key: values.record_key,
        payload,
      });
      message.success('持久化记录已写入');
      persistenceRecordForm.resetFields();
      loadInfrastructure();
    } catch (error) {
      message.error(`写入持久化记录失败: ${error instanceof SyntaxError ? 'JSON 格式无效' : error.userMessage || error.message}`);
    }
  }, [loadInfrastructure, message, persistenceRecordForm]);

  const handleBootstrapPersistence = useCallback(async (values) => {
    setPersistenceBootstrapLoading(true);
    try {
      const response = await bootstrapInfrastructurePersistence({
        enable_timescale_schema: values.enable_timescale_schema !== false,
      });
      setPersistenceDiagnostics(response.diagnostics || null);
      message.success(`数据库持久化初始化完成: ${response.status}`);
      loadInfrastructure();
    } catch (error) {
      message.error(`初始化数据库持久化失败: ${error.userMessage || error.message}`);
    } finally {
      setPersistenceBootstrapLoading(false);
    }
  }, [loadInfrastructure, message, setPersistenceBootstrapLoading, setPersistenceDiagnostics]);

  const handlePreviewPersistenceMigration = useCallback(async (values = {}) => {
    setPersistenceMigrationLoading(true);
    try {
      const response = await getInfrastructurePersistenceMigrationPreview({
        sqlitePath: values.sqlite_path || undefined,
      });
      setPersistenceMigrationPreview(response);
      message.success('持久化迁移预览已刷新');
    } catch (error) {
      message.error(`加载持久化迁移预览失败: ${error.userMessage || error.message}`);
    } finally {
      setPersistenceMigrationLoading(false);
    }
  }, [message, setPersistenceMigrationLoading, setPersistenceMigrationPreview]);

  const handleRunPersistenceMigration = useCallback(async (values) => {
    setPersistenceMigrationLoading(true);
    try {
      const response = await runInfrastructurePersistenceMigration({
        sqlite_path: values.sqlite_path || undefined,
        dry_run: values.dry_run !== false,
        include_records: values.include_records !== false,
        include_timeseries: values.include_timeseries !== false,
        dedupe_timeseries: values.dedupe_timeseries !== false,
        record_limit: values.record_limit || undefined,
        timeseries_limit: values.timeseries_limit || undefined,
      });
      setPersistenceMigrationPreview(response.preview || response);
      if (response.post_migration) {
        setPersistenceDiagnostics((current) => ({
          ...(current || {}),
          ...response.post_migration,
        }));
      }
      message.success(
        response.dry_run
          ? `迁移预演完成: records ${response.planned_records || 0} / timeseries ${response.planned_timeseries || 0}`
          : `迁移完成: 新增 records ${response.migrated_records || 0}，新增时序 ${response.migrated_timeseries || 0}`,
      );
      loadInfrastructure();
    } catch (error) {
      message.error(`执行持久化迁移失败: ${error.userMessage || error.message}`);
    } finally {
      setPersistenceMigrationLoading(false);
    }
  }, [
    loadInfrastructure,
    message,
    setPersistenceDiagnostics,
    setPersistenceMigrationLoading,
    setPersistenceMigrationPreview,
  ]);

  const handleSaveTimeseries = useCallback(async (values) => {
    try {
      const payload = parseOptionalJson(values.payload);
      await saveInfrastructureTimeseries({
        series_name: values.series_name,
        symbol: values.symbol,
        timestamp: values.timestamp || new Date().toISOString(),
        value: values.value,
        payload,
      });
      message.success('时序样本已写入');
      timeseriesForm.resetFields();
      timeseriesForm.setFieldsValue({ timestamp: new Date().toISOString() });
      loadInfrastructure();
    } catch (error) {
      message.error(`写入时序样本失败: ${error instanceof SyntaxError ? 'JSON 格式无效' : error.userMessage || error.message}`);
    }
  }, [loadInfrastructure, message, timeseriesForm]);

  const handleLoadPersistenceExplorer = useCallback(async (values) => {
    try {
      const [recordsPayload, timeseriesPayload] = await Promise.all([
        getInfrastructureRecords({ recordType: values.record_type || undefined, limit: values.record_limit || 12 }),
        getInfrastructureTimeseries({ seriesName: values.series_name || undefined, symbol: values.symbol || undefined, limit: values.timeseries_limit || 12 }),
      ]);
      setPersistenceRecords(recordsPayload.records || []);
      setPersistenceTimeseries(timeseriesPayload.timeseries || []);
      message.success('持久化视图已刷新');
    } catch (error) {
      message.error(`刷新持久化视图失败: ${error.userMessage || error.message}`);
    }
  }, [message, setPersistenceRecords, setPersistenceTimeseries]);

  return {
    handleBootstrapPersistence,
    handleCancelTask,
    handleCreateTask,
    handleLoadPersistenceExplorer,
    handlePreviewPersistenceMigration,
    handleRunPersistenceMigration,
    handleSavePersistenceRecord,
    handleSaveTimeseries,
  };
}

export default useQuantLabInfrastructurePersistenceActions;
