const { runQuantLabFeatureVerification } = require('./verify_quantlab_features');

(async () => {
  console.warn('兼容入口提示: `verify_realtime_features.js` 已切换为 Quant Lab 浏览器回归，请优先使用 `npm run verify:quantlab`。');
  await runQuantLabFeatureVerification({ legacyAlias: 'verify:realtime' });
})().catch((error) => {
  console.error('Quant Lab E2E 回归失败:', error);
  process.exit(1);
});
