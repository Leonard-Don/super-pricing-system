const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { partitionConsoleMessages } = require('./consoleNoise');
const { API_BASE_URL, FRONTEND_BASE_URL } = require('./runtimeConfig');

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const OUTPUT_DIR = path.resolve(__dirname, '../../output/playwright');
const FRONTEND_HEALTH_URL = `${FRONTEND_BASE_URL}/?view=quantlab`;
const API_HEALTH_URL = `${API_BASE_URL}/health`;

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const writeArtifacts = async (page, filenamePrefix) => {
  ensureDir(OUTPUT_DIR);
  const screenshotPath = path.join(OUTPUT_DIR, `${filenamePrefix}.png`);
  const htmlPath = path.join(OUTPUT_DIR, `${filenamePrefix}.html`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(htmlPath, await page.content(), 'utf8');
};

const assertOk = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const ensureServiceAvailable = async (request, url, name) => {
  const response = await request.get(url, { timeout: 30000 });
  assertOk(response.ok(), `${name} 不可用: ${url} (${response.status()})`);
};

const normalizeText = (value) => String(value || '').replace(/\s+/g, '');

const waitForToast = async (page, pattern, timeout = 90000) => {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  await page.waitForFunction((source) => {
    const re = new RegExp(source.pattern, source.flags);
    return Array.from(document.querySelectorAll('.ant-message-notice')).some((node) => re.test(node.textContent || ''));
  }, { pattern: regex.source, flags: regex.flags }, { timeout });
};

const click = async (locator) => {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.waitFor({ state: 'visible', timeout: 60000 });
  await locator.click({ timeout: 60000 });
};

const clickShortcut = async (page, shortTitle) => {
  const buttons = page.locator('[data-testid="quantlab-shortcuts"] button');
  const count = await buttons.count();
  const normalizedTarget = normalizeText(shortTitle);

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const label = normalizeText(await button.innerText().catch(() => ''));
    if (label === normalizedTarget) {
      await click(button);
      return;
    }
  }

  throw new Error(`未找到 Quant Lab 快捷按钮: ${shortTitle}`);
};

const getVisibleButton = (page, text, index = 0) => (
  page.locator('button:visible').filter({ hasText: text }).nth(index)
);

const getVisibleCardTitle = (page, text, index = 0) => (
  page.locator('.ant-card-head-title').filter({ hasText: text }).nth(index)
);

const clickNestedTab = async (page, text) => {
  const tab = page.getByRole('tab', { name: text, exact: false }).last();
  await click(tab);
  await page.waitForTimeout(150);
};

async function runQuantLabFeatureVerification(options = {}) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1280 },
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const completed = [];
  const failures = [];
  const legacyAlias = options.legacyAlias || '';

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleMessages.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message || String(error));
  });

  const runStep = async (name, fn) => {
    try {
      await fn();
      completed.push(name);
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error: error.message || String(error) });
      console.error(`FAIL ${name}: ${error.message || error}`);
      await writeArtifacts(page, `failure-${name}`).catch(() => {});
    }
  };

  try {
    await ensureServiceAvailable(context.request, FRONTEND_HEALTH_URL, '前端');
    await ensureServiceAvailable(context.request, API_HEALTH_URL, '后端');

    if (legacyAlias) {
      console.log(`正在执行 ${legacyAlias} 兼容回归...`);
    }

    await page.goto(`${FRONTEND_BASE_URL}/?view=quantlab`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('[data-testid="quantlab-page"]').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('[data-testid="quantlab-hero"]').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('[data-testid="quantlab-shortcuts"]').waitFor({ state: 'visible', timeout: 60000 });

    await runStep('optimizer', async () => {
      await clickShortcut(page, '优化');
      await getVisibleButton(page, '运行优化').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '运行优化'));
      await waitForToast(page, /参数优化完成/);
      await getVisibleCardTitle(page, '最优参数与验证闭环').waitFor({ state: 'visible', timeout: 90000 });
      await click(getVisibleButton(page, '异步排队'));
      await waitForToast(page, /已进入异步队列|异步任务已提交/);
    });

    await runStep('backtest-enhance', async () => {
      await clickShortcut(page, '回测');
      await getVisibleButton(page, '运行 MC').waitFor({ state: 'visible', timeout: 60000 });

      const checks = [
        { button: '运行 MC', toast: /Monte Carlo 路径模拟完成/, result: 'Monte Carlo 结果' },
        { button: '检验显著性', toast: /策略显著性检验完成/, result: '显著性检验结果' },
        { button: '运行多周期', toast: /多周期回测完成/, result: '多周期结果' },
        { button: '分析冲击', toast: /市场冲击敏感性分析完成/, result: '市场冲击场景对比' },
      ];

      for (const [index, item] of checks.entries()) {
        await click(getVisibleButton(page, item.button));
        await waitForToast(page, item.toast);
        await getVisibleCardTitle(page, item.result).waitFor({ state: 'visible', timeout: 90000 });
        await click(getVisibleButton(page, '异步排队', index));
        await waitForToast(page, /已进入异步队列|异步任务已提交/);
      }
    });

    await runStep('risk', async () => {
      await clickShortcut(page, '风险');
      await getVisibleButton(page, '运行风险分析').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '运行风险分析'));
      await waitForToast(page, /风险分析完成/);
      await getVisibleCardTitle(page, 'VaR / CVaR').waitFor({ state: 'visible', timeout: 90000 });
      await click(getVisibleButton(page, '异步排队'));
      await waitForToast(page, /已进入异步队列|异步任务已提交/);
    });

    await runStep('valuation', async () => {
      await clickShortcut(page, '估值');
      await getVisibleButton(page, '运行估值实验').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '运行估值实验'));
      await waitForToast(page, /估值实验已更新并写入历史/);
      await getVisibleCardTitle(page, '估值历史追踪').waitFor({ state: 'visible', timeout: 90000 });
      await click(getVisibleButton(page, '异步排队'));
      await waitForToast(page, /已进入异步队列|异步任务已提交/);
    });

    await runStep('industry-rotation', async () => {
      await clickShortcut(page, '轮动');
      await getVisibleButton(page, '运行行业轮动回测').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '运行行业轮动回测'));
      await waitForToast(page, /行业轮动策略回测完成/);
      await getVisibleCardTitle(page, '策略诊断').waitFor({ state: 'visible', timeout: 90000 });
      await click(getVisibleButton(page, '异步排队'));
      await waitForToast(page, /已进入异步队列|异步任务已提交/);
    });

    await runStep('industry-intel', async () => {
      await clickShortcut(page, '行业智能');
      await getVisibleButton(page, '刷新行业智能').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '刷新行业智能'));
      await waitForToast(page, /行业智能扩展已刷新/);
      await getVisibleCardTitle(page, '生命周期、ETF 映射与事件日历').waitFor({ state: 'visible', timeout: 90000 });
    });

    await runStep('signal-validation', async () => {
      await clickShortcut(page, '信号');
      await getVisibleButton(page, '运行信号验证').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '运行信号验证'));
      await waitForToast(page, /信号验证已完成/);
      await getVisibleCardTitle(page, '宏观信号 Forward Return 验证').waitFor({ state: 'visible', timeout: 90000 });
      await click(getVisibleButton(page, '探测行情深度'));
      await waitForToast(page, /实时行情深度探测完成/);
      await getVisibleCardTitle(page, '订单簿深度').waitFor({ state: 'visible', timeout: 90000 });
    });

    await runStep('factor', async () => {
      await clickShortcut(page, '因子');
      await getVisibleButton(page, '计算因子').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '计算因子'));
      await waitForToast(page, /自定义因子已计算/);
      await getVisibleCardTitle(page, '因子预览').waitFor({ state: 'visible', timeout: 90000 });
      await click(getVisibleButton(page, '异步排队'));
      await waitForToast(page, /已进入异步队列|异步任务已提交/);
    });

    await runStep('infrastructure', async () => {
      await clickShortcut(page, '基础设施');
      await getVisibleButton(page, '刷新基础设施').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '刷新基础设施'));
      await page.getByText('提交异步任务', { exact: true }).waitFor({ state: 'visible', timeout: 90000 });
      await click(getVisibleButton(page, '提交任务'));
      await waitForToast(page, /异步任务已提交/);
      await click(getVisibleButton(page, '生成令牌'));
      await waitForToast(page, /研究令牌已签发/);
      await click(getVisibleButton(page, '发送测试'));
      await waitForToast(page, /通知通道返回:/);
    });

    await runStep('ops', async () => {
      await clickShortcut(page, '运营');
      await getVisibleButton(page, '刷新运营面板').waitFor({ state: 'visible', timeout: 60000 });
      await click(getVisibleButton(page, '刷新运营面板'));
      await getVisibleCardTitle(page, '智能告警编排中心').waitFor({ state: 'visible', timeout: 90000 });

      const nestedTabs = ['交易明细', '日报与复盘', '策略生命周期', '规则编排', '历史与复盘', 'Provider 健康', '审计与故障转移'];
      for (const tabName of nestedTabs) {
        await clickNestedTab(page, tabName);
      }

      await clickNestedTab(page, '规则编排');
      const orchestrationCard = page.locator('.ant-card').filter({ has: page.getByText('智能告警编排中心', { exact: true }) }).first();
      await orchestrationCard.waitFor({ state: 'visible', timeout: 60000 });

      await orchestrationCard.getByPlaceholder('如 跨市场对冲信号').fill(`浏览器回归规则 ${Date.now()}`);
      await orchestrationCard.getByPlaceholder('如 A股走弱 + 商品走强 + 情绪转空').fill('A股走弱 + 商品走强 + 波动率抬升');
      await orchestrationCard.getByPlaceholder('如 保存到研究工作台 + Webhook').fill('保存到研究工作台 + Webhook');
      await click(orchestrationCard.getByRole('button', { name: '新增复合规则' }));
      await waitForToast(page, /复合告警规则已添加/);

      const publishCard = orchestrationCard.locator('.ant-card').filter({ has: page.getByText('发布事件到统一总线', { exact: true }) }).first();
      await publishCard.waitFor({ state: 'visible', timeout: 60000 });
      await publishCard.getByPlaceholder('如 跨市场防御切换').fill(`浏览器回归事件 ${Date.now()}`);
      await publishCard.getByPlaceholder('如 SPY').fill('SPY');
      await publishCard.getByPlaceholder('如 A股走弱 + 商品走强 + 波动率抬升').fill('A股走弱 + 商品走强 + 波动率抬升');
      await publishCard.getByPlaceholder('如 建议切换到防御 / 对冲研究流程').fill('建议切换到防御 / 对冲研究流程');
      await publishCard.getByPlaceholder('如 dry_run webhook research_webhook').fill('dry_run');
      await click(publishCard.getByRole('button', { name: '发布事件' }));
      await waitForToast(page, /告警事件已发布/);
    });

    await writeArtifacts(page, 'quantlab-operations-e2e');

    const { ignoredSummary, unknown } = partitionConsoleMessages(consoleMessages);
    const summary = {
      completed,
      failures,
      ignoredConsoleWarnings: ignoredSummary,
      unknownConsoleErrors: unknown,
      pageErrors,
      legacyAlias,
    };
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'quantlab-operations-summary.json'),
      JSON.stringify(summary, null, 2),
      'utf8',
    );

    if (ignoredSummary.length) {
      ignoredSummary.forEach((item) => {
        console.log(`忽略已知 console 噪音: ${item.label} x${item.count}`);
      });
    }

    if (unknown.length) {
      console.log(`未知 console error 数量: ${unknown.length}`);
      unknown.slice(0, 5).forEach((item, index) => {
        console.log(`  [${index + 1}] ${item}`);
      });
    }

    if (pageErrors.length) {
      console.log(`pageerror 数量: ${pageErrors.length}`);
      pageErrors.slice(0, 5).forEach((item, index) => {
        console.log(`  [${index + 1}] ${item}`);
      });
    }

    assertOk(failures.length === 0, '存在未通过的 Quant Lab 浏览器步骤');
    assertOk(unknown.length === 0, '检测到未知 console error');
    assertOk(pageErrors.length === 0, '检测到页面运行时异常');
    console.log('Quant Lab E2E 回归通过');
  } finally {
    await context.close();
    await browser.close();
  }
}

if (require.main === module) {
  runQuantLabFeatureVerification().catch((error) => {
    console.error('Quant Lab E2E 回归失败:', error);
    process.exit(1);
  });
}

module.exports = {
  runQuantLabFeatureVerification,
};
