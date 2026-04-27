const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { API_BASE_URL, FRONTEND_BASE_URL, buildRuntimeEnv } = require('./runtimeConfig');

const E2E_DIR = __dirname;
const PROJECT_ROOT = path.resolve(E2E_DIR, '..', '..');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');
const LOG_DIR = path.join(PROJECT_ROOT, 'logs', 'e2e');
const E2E_RUNTIME_DIR = path.join(LOG_DIR, 'runtime');
const BACKEND_QUANT_LAB_STORAGE_ROOT = path.join(E2E_RUNTIME_DIR, 'quant_lab');
const FRONTEND_START_SCRIPT = path.join(FRONTEND_DIR, 'scripts', 'start.js');

const frontendUrl = new URL(FRONTEND_BASE_URL);
const apiUrl = new URL(API_BASE_URL);

const FRONTEND_PORT = Number(frontendUrl.port || (frontendUrl.protocol === 'https:' ? '443' : '80'));
const BACKEND_PORT = Number(apiUrl.port || (apiUrl.protocol === 'https:' ? '443' : '80'));

const startedProcesses = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const canReach = async (url) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch (error) {
    return false;
  }
};

const readCommandOutput = (command, args) => {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (error) {
    return '';
  }
};

const listListeningPids = (port) => {
  const output = readCommandOutput('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN']);
  if (!output) {
    return [];
  }
  return output
    .split(/\s+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
};

const getProcessCommand = (pid) => readCommandOutput('ps', ['-p', String(pid), '-o', 'command=']);

const getProcessCwd = (pid) => {
  const output = readCommandOutput('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const match = output.match(/^n(.+)$/m);
  return match?.[1]?.trim() || '';
};

const isProjectManagedProcess = (pid) => {
  const command = getProcessCommand(pid);
  const cwd = getProcessCwd(pid);
  return Boolean(
    (command && (command.includes(PROJECT_ROOT) || command.includes(FRONTEND_DIR)))
    || (cwd && (cwd === PROJECT_ROOT || cwd === FRONTEND_DIR || cwd.startsWith(`${PROJECT_ROOT}/`)))
  );
};

const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
};

const stopPid = async (pid, label) => {
  if (!processAlive(pid)) {
    return;
  }

  const groupPid = pid > 1 ? -pid : pid;

  try {
    process.kill(groupPid, 'SIGTERM');
  } catch (error) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (innerError) {
      return;
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!processAlive(pid)) {
      return;
    }
    await sleep(500);
  }

  try {
    process.kill(groupPid, 'SIGKILL');
  } catch (error) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (innerError) {
      console.warn(`⚠️  无法强制结束 ${label} 进程 ${pid}: ${innerError.message}`);
    }
  }
};

const ensurePortAvailable = async (port, label) => {
  const listeners = listListeningPids(port);
  if (!listeners.length) {
    return;
  }

  const projectManaged = listeners.filter((pid) => isProjectManagedProcess(pid));
  for (const pid of projectManaged) {
    console.log(`⚠️  ${label} 端口 ${port} 上发现本项目残留进程 ${pid}，正在清理...`);
    await stopPid(pid, label);
  }

  const remaining = listListeningPids(port);
  if (!remaining.length) {
    return;
  }

  throw new Error(`${label} 端口 ${port} 被非本项目进程占用: ${remaining.join(', ')}`);
};

const tailLog = (logFile, lineCount = 40) => {
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-lineCount)
      .join('\n');
  } catch (error) {
    return '';
  }
};

const buildLogTailBlock = (meta) => {
  if (!meta?.logFile) {
    return '';
  }

  const tail = tailLog(meta.logFile);
  if (!tail) {
    return `日志文件: ${meta.logFile}\n(暂无输出)`;
  }

  return `日志文件: ${meta.logFile}\n${tail}`;
};

const waitForService = async (serviceName, url, timeout = 180000, meta = null) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await canReach(url)) {
      return;
    }

    if (meta?.exitInfo) {
      const detail = buildLogTailBlock(meta);
      throw new Error(`${serviceName} 启动进程已退出 (code=${meta.exitInfo.code ?? 'null'}, signal=${meta.exitInfo.signal ?? 'null'})\n${detail}`);
    }

    await sleep(1000);
  }

  const detail = meta ? `\n${buildLogTailBlock(meta)}` : '';
  throw new Error(`${serviceName} 在 ${timeout}ms 内未就绪: ${url}${detail}`);
};

const startManagedProcess = async (serviceKey, serviceConfig) => {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(E2E_RUNTIME_DIR, { recursive: true });
  await ensurePortAvailable(serviceConfig.port, serviceConfig.label);

  if (serviceKey === 'backend') {
    fs.rmSync(BACKEND_QUANT_LAB_STORAGE_ROOT, { recursive: true, force: true });
  }

  const logFile = path.join(LOG_DIR, serviceConfig.logFile);
  fs.appendFileSync(
    logFile,
    `\n===== ${new Date().toISOString()} starting ${serviceConfig.label} =====\n`,
    'utf8',
  );
  const logFd = fs.openSync(logFile, 'a');
  const child = spawn(serviceConfig.command, serviceConfig.args, {
    cwd: serviceConfig.cwd,
    env: buildRuntimeEnv(serviceConfig.envOverrides || {}),
    stdio: ['ignore', logFd, logFd],
    detached: true,
    windowsHide: true,
  });
  fs.closeSync(logFd);

  const meta = {
    serviceKey,
    label: serviceConfig.label,
    logFile,
    pid: child.pid,
    exitInfo: null,
  };

  child.on('exit', (code, signal) => {
    meta.exitInfo = { code, signal };
  });
  child.unref();

  startedProcesses.push(meta);
  return meta;
};

const SERVICE_CONFIG = {
  backend: {
    label: '后端服务',
    url: `${API_BASE_URL}/health`,
    port: BACKEND_PORT,
    command: 'python3',
    args: [path.join(PROJECT_ROOT, 'scripts/start_backend.py')],
    cwd: PROJECT_ROOT,
    envOverrides: {
      API_RELOAD: 'false',
      DISABLE_NONCRITICAL_STARTUP_TASKS: 'true',
      QUANT_LAB_STORAGE_ROOT: BACKEND_QUANT_LAB_STORAGE_ROOT,
    },
    logFile: 'backend.log',
  },
  frontend: {
    label: '前端服务',
    url: `${FRONTEND_BASE_URL}/?view=pricing`,
    port: FRONTEND_PORT,
    command: process.execPath,
    args: [FRONTEND_START_SCRIPT],
    cwd: FRONTEND_DIR,
    envOverrides: {},
    logFile: 'frontend.log',
  },
};

const ensureAppServices = async () => {
  const frontendReady = await canReach(SERVICE_CONFIG.frontend.url);
  const backendReady = await canReach(SERVICE_CONFIG.backend.url);

  let backendMeta = null;
  let frontendMeta = null;

  if (!backendReady) {
    console.log('后端未运行，正在自动启动...');
    backendMeta = await startManagedProcess('backend', SERVICE_CONFIG.backend);
  }

  if (!frontendReady) {
    console.log('前端未运行，正在自动启动...');
    frontendMeta = await startManagedProcess('frontend', SERVICE_CONFIG.frontend);
  }

  if (!backendReady) {
    await waitForService('后端', SERVICE_CONFIG.backend.url, 180000, backendMeta);
  }
  if (!frontendReady) {
    await waitForService('前端', SERVICE_CONFIG.frontend.url, 180000, frontendMeta);
  }
};

const stopManagedProcesses = async () => {
  for (const meta of startedProcesses.reverse()) {
    if (meta?.pid) {
      await stopPid(meta.pid, meta.label);
    }
  }
  startedProcesses.length = 0;
};

const buildServiceDebugSummary = async () => {
  const lines = [];
  const frontendReady = await canReach(SERVICE_CONFIG.frontend.url);
  const backendReady = await canReach(SERVICE_CONFIG.backend.url);

  lines.push(`前端可达: ${frontendReady ? 'yes' : 'no'} (${SERVICE_CONFIG.frontend.url})`);
  lines.push(`后端可达: ${backendReady ? 'yes' : 'no'} (${SERVICE_CONFIG.backend.url})`);

  for (const meta of startedProcesses) {
    lines.push(
      `${meta.label} PID=${meta.pid || 'unknown'} exited=${meta.exitInfo ? `yes(code=${meta.exitInfo.code ?? 'null'}, signal=${meta.exitInfo.signal ?? 'null'})` : 'no'}`
    );
    const tailBlock = buildLogTailBlock(meta);
    if (tailBlock) {
      lines.push(tailBlock);
    }
  }

  return lines.join('\n');
};

module.exports = {
  buildServiceDebugSummary,
  canReach,
  ensureAppServices,
  stopManagedProcesses,
  waitForService,
};
