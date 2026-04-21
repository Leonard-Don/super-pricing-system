import { useCallback } from 'react';
import {
  deleteNotificationChannel,
  saveNotificationChannel,
  testNotificationChannel,
} from '../../services/api';

const parseOptionalJson = (value) => (value ? JSON.parse(value) : {});

function useQuantLabInfrastructureNotificationActions({
  loadInfrastructure,
  message,
  notificationChannelForm,
  notificationForm,
}) {
  const handleTestNotification = useCallback(async (values) => {
    try {
      const response = await testNotificationChannel({
        channel: values.channel,
        payload: {
          title: values.title,
          message: values.message,
          severity: values.severity,
        },
      });
      message.success(`通知通道返回: ${response.status}`);
      notificationForm.resetFields();
      loadInfrastructure();
    } catch (error) {
      message.error(`通知测试失败: ${error.userMessage || error.message}`);
    }
  }, [loadInfrastructure, message, notificationForm]);

  const handleSaveNotificationChannel = useCallback(async (values) => {
    try {
      const settings = parseOptionalJson(values.settings);
      await saveNotificationChannel({
        id: values.id,
        type: values.type,
        label: values.label,
        enabled: values.enabled !== false,
        settings,
      });
      notificationChannelForm.resetFields();
      message.success('通知渠道已保存');
      loadInfrastructure();
    } catch (error) {
      message.error(`保存通知渠道失败: ${error instanceof SyntaxError ? 'JSON 格式无效' : error.userMessage || error.message}`);
    }
  }, [loadInfrastructure, message, notificationChannelForm]);

  const handleDeleteNotificationChannel = useCallback(async (channelId) => {
    try {
      await deleteNotificationChannel(channelId);
      message.success('通知渠道已删除');
      loadInfrastructure();
    } catch (error) {
      message.error(`删除通知渠道失败: ${error.userMessage || error.message}`);
    }
  }, [loadInfrastructure, message]);

  return {
    handleDeleteNotificationChannel,
    handleSaveNotificationChannel,
    handleTestNotification,
  };
}

export default useQuantLabInfrastructureNotificationActions;
