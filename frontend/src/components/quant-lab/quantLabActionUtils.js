export const parseOptionalJson = (value, fallback = {}) => (
  value ? JSON.parse(value) : fallback
);

export const invokeFirstDefined = async (...callbacks) => {
  const callback = callbacks.find((candidate) => typeof candidate === 'function');
  return callback ? callback() : null;
};
