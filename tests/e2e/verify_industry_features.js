const { runAppSurfaceVerification } = require('./verify_app_surface');

(async () => {
  console.warn('兼容入口提示: `verify_industry_features.js` 已切换为当前主应用入口回归，请优先使用 `npm run verify:app-surface`。');
  await runAppSurfaceVerification({ legacyAlias: 'verify:industry' });
})().catch((error) => {
  console.error('当前主应用入口 E2E 回归失败:', error);
  process.exit(1);
});
