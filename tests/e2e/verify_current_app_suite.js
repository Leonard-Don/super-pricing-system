const { spawn } = require('child_process');
const path = require('path');
const { buildRuntimeEnv } = require('./runtimeConfig');
const {
  buildServiceDebugSummary,
  ensureAppServices,
  stopManagedProcesses,
} = require('./serviceManager');

const E2E_DIR = __dirname;
const STEPS = [
  { label: 'app-surface', script: 'verify_app_surface.js' },
  { label: 'research-workflow', script: 'verify_research_suite.js' },
  { label: 'quantlab', script: 'verify_quantlab_features.js' },
];

const runStep = (step) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(E2E_DIR, step.script)], {
    cwd: E2E_DIR,
    env: buildRuntimeEnv(),
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`${step.label} 回归失败，退出码 ${code}`));
  });
  child.on('error', reject);
});

(async () => {
  try {
    await ensureAppServices();
    for (const step of STEPS) {
      await ensureAppServices();
      console.log(`\n=== 开始执行 ${step.label} ===`);
      await runStep(step);
      console.log(`=== ${step.label} 已通过 ===`);
    }
    console.log('\n当前主应用浏览器回归全部通过。');
  } catch (error) {
    console.error(`\n当前主应用浏览器回归失败: ${error.message}`);
    console.error(await buildServiceDebugSummary());
    process.exitCode = 1;
  } finally {
    await stopManagedProcesses();
  }
})();
