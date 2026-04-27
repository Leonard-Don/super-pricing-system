'use strict';

const SUPPRESSED_WARNING_CODES = new Set([
  'DEP_WEBPACK_DEV_SERVER_ON_AFTER_SETUP_MIDDLEWARE',
  'DEP_WEBPACK_DEV_SERVER_ON_BEFORE_SETUP_MIDDLEWARE',
]);

const SUPPRESSED_WARNING_TEXT = [
  "'onAfterSetupMiddleware' option is deprecated.",
  "'onBeforeSetupMiddleware' option is deprecated.",
];

function resolveWarningCode(warning, args) {
  if (warning && typeof warning === 'object' && typeof warning.code === 'string') {
    return warning.code;
  }
  if (args[0] && typeof args[0] === 'object' && typeof args[0].code === 'string') {
    return args[0].code;
  }
  if (typeof args[1] === 'string' && args[1].startsWith('DEP_')) {
    return args[1];
  }
  if (typeof args[0] === 'string' && args[0].startsWith('DEP_')) {
    return args[0];
  }
  return null;
}

function resolveWarningMessage(warning) {
  if (typeof warning === 'string') {
    return warning;
  }
  if (warning && typeof warning.message === 'string') {
    return warning.message;
  }
  return String(warning);
}

const originalEmitWarning = process.emitWarning.bind(process);

process.emitWarning = (warning, ...args) => {
  const code = resolveWarningCode(warning, args);
  const message = resolveWarningMessage(warning);

  if (
    SUPPRESSED_WARNING_CODES.has(code) ||
    SUPPRESSED_WARNING_TEXT.some((snippet) => message.includes(snippet))
  ) {
    return;
  }

  return originalEmitWarning(warning, ...args);
};

require('react-scripts/scripts/start');
