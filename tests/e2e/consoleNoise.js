const KNOWN_CONSOLE_NOISE_PATTERNS = [
  {
    key: 'antd-message-context',
    label: 'Ant Design message context warning',
    pattern: /Warning:\s*\[antd: message\]\s*Static function can not consume context like dynamic theme/i,
  },
  {
    key: 'frontend-dev-server-ws-refused',
    label: 'Frontend dev-server websocket refused',
    // React Scripts / webpack-dev-server may emit a transient local /ws refusal
    // during headless browser runs even while the page and business websocket
    // flows remain healthy. Keep the ignore scope narrow to the dev-server path.
    pattern: /WebSocket connection to 'ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/ws' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED/i,
  },
];

const classifyConsoleMessage = (message = '') => {
  const normalizedMessage = String(message || '');
  const matchedPattern = KNOWN_CONSOLE_NOISE_PATTERNS.find(({ pattern }) => pattern.test(normalizedMessage));
  if (!matchedPattern) {
    return {
      ignored: false,
      key: 'unknown',
      label: 'unknown',
      message: normalizedMessage,
    };
  }

  return {
    ignored: true,
    key: matchedPattern.key,
    label: matchedPattern.label,
    message: normalizedMessage,
  };
};

const partitionConsoleMessages = (messages = []) => {
  const ignored = [];
  const unknown = [];
  const ignoredSummary = new Map();

  (messages || []).forEach((message) => {
    const classification = classifyConsoleMessage(message);
    if (classification.ignored) {
      ignored.push(classification.message);
      ignoredSummary.set(
        classification.key,
        {
          key: classification.key,
          label: classification.label,
          count: Number(ignoredSummary.get(classification.key)?.count || 0) + 1,
        },
      );
      return;
    }
    unknown.push(classification.message);
  });

  return {
    ignored,
    unknown,
    ignoredSummary: Array.from(ignoredSummary.values()),
  };
};

module.exports = {
  KNOWN_CONSOLE_NOISE_PATTERNS,
  partitionConsoleMessages,
};
