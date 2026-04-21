const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { partitionConsoleMessages } = require('./consoleNoise');
const { API_BASE_URL, FRONTEND_BASE_URL } = require('./runtimeConfig');

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const OUTPUT_DIR = path.resolve(__dirname, '../../output/playwright');
const FRONTEND_HEALTH_URL = `${FRONTEND_BASE_URL}/?view=pricing`;
const API_HEALTH_URL = `${API_BASE_URL}/health`;

const ROUTES = [
  {
    key: 'pricing',
    url: `${FRONTEND_BASE_URL}/?view=pricing`,
    waitFor: async (page) => {
      await page.locator('[data-testid="pricing-research-page"]').waitFor({ state: 'visible', timeout: 60000 });
    },
  },
  {
    key: 'godeye',
    url: `${FRONTEND_BASE_URL}/?view=godsEye`,
    waitFor: async (page) => {
      await page.getByText('GodEye V2 作战大屏', { exact: true }).waitFor({ state: 'visible', timeout: 60000 });
    },
  },
  {
    key: 'workbench',
    url: `${FRONTEND_BASE_URL}/?view=workbench`,
    waitFor: async (page) => {
      await page.locator('[data-testid="workbench-page"]').waitFor({ state: 'visible', timeout: 60000 });
    },
  },
  {
    key: 'quantlab',
    url: `${FRONTEND_BASE_URL}/?view=quantlab`,
    waitFor: async (page) => {
      await page.locator('[data-testid="quantlab-page"]').waitFor({ state: 'visible', timeout: 60000 });
      await page.locator('[data-testid="quantlab-shortcuts"]').waitFor({ state: 'visible', timeout: 60000 });
    },
  },
  {
    key: 'cross-market',
    url: `${FRONTEND_BASE_URL}/?view=backtest&tab=cross-market`,
    waitFor: async (page) => {
      await page.getByText('模板快选', { exact: true }).last().waitFor({ state: 'visible', timeout: 60000 });
      await page.getByText('右侧保持输入，左侧专注结果', { exact: true }).waitFor({ state: 'visible', timeout: 60000 });
    },
  },
  {
    key: 'quantlab-alias',
    url: `${FRONTEND_BASE_URL}/quantlab`,
    waitFor: async (page) => {
      await page.locator('[data-testid="quantlab-page"]').waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForURL(/[\?&]view=quantlab/, { timeout: 60000 });
    },
  },
];

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

async function runAppSurfaceVerification(options = {}) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const routeResults = [];
  const legacyAlias = options.legacyAlias || '';

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleMessages.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message || String(error));
  });

  try {
    await ensureServiceAvailable(context.request, FRONTEND_HEALTH_URL, '前端');
    await ensureServiceAvailable(context.request, API_HEALTH_URL, '后端');

    if (legacyAlias) {
      console.log(`正在执行 ${legacyAlias} 兼容回归...`);
    }

    for (const route of ROUTES) {
      console.log(`验证当前入口: ${route.key}`);
      await page.goto(route.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await route.waitFor(page);
      await writeArtifacts(page, `route-check-${route.key}`);
      routeResults.push({
        key: route.key,
        requestedUrl: route.url,
        finalUrl: page.url(),
      });
    }

    const { ignoredSummary, unknown } = partitionConsoleMessages(consoleMessages);
    const summary = {
      routeResults,
      ignoredConsoleWarnings: ignoredSummary,
      unknownConsoleErrors: unknown,
      pageErrors,
      legacyAlias,
    };
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'app-surface-summary.json'),
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

    assertOk(unknown.length === 0, '检测到未知 console error');
    assertOk(pageErrors.length === 0, '检测到页面运行时异常');
    console.log('当前主应用入口 E2E 回归通过');
  } finally {
    await context.close();
    await browser.close();
  }
}

if (require.main === module) {
  runAppSurfaceVerification().catch((error) => {
    console.error('当前主应用入口 E2E 回归失败:', error);
    process.exit(1);
  });
}

module.exports = {
  runAppSurfaceVerification,
};
