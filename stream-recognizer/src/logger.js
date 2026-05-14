import newrelic from 'newrelic';
import pino from 'pino';

function nrForwardingEnabled() {
  return process.env.NEW_RELIC_ENABLED !== 'false' && Boolean(process.env.NEW_RELIC_LICENSE_KEY);
}

function nrPrimitiveAttrs(o) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    return out;
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === 'msg' || k === 'message') {
      continue;
    }
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {unknown[]} args
 * @param {number} levelVal
 * @param {import('pino').Logger} log
 */
function forwardLogToNewRelic(args, levelVal, log) {
  if (!log.levels || !nrForwardingEnabled()) {
    return;
  }

  const label = log.levels.labels[levelVal] || 'info';
  const level = String(label).toUpperCase();

  let message;
  /** @type {Record<string, unknown>} */
  const payload = { level };
  let errObj;

  if (args.length === 0) {
    return;
  }

  const [first, second] = args;

  if (typeof first === 'string') {
    message = args.length > 1 ? args.join(' ') : first;
  } else if (first && typeof first === 'object' && !Array.isArray(first)) {
    errObj = first.err instanceof Error ? first.err : undefined;
    if (typeof second === 'string') {
      message = second;
      Object.assign(payload, nrPrimitiveAttrs(first));
    } else {
      const m = first.msg ?? first.message;
      message = typeof m === 'string' && m.trim() ? m : 'event';
      Object.assign(payload, nrPrimitiveAttrs(first));
    }
  } else {
    message = String(first);
  }

  if (!message) {
    return;
  }

  payload.message = message;
  if (errObj) {
    payload.error = errObj;
  }

  try {
    newrelic.recordLogEvent(payload);
  } catch {
    // ignore
  }
}

/**
 * Pino logger with New Relic `recordLogEvent` forwarding (pino instrumentation disabled in newrelic.cjs).
 * `child()` works; the logMethod hook runs for child loggers too.
 */
const logger = pino({
  level: process.env.PINO_LOG_LEVEL || 'info',
  hooks: {
    logMethod(args, method, level) {
      method.apply(this, args);
      forwardLogToNewRelic(args, level, this);
    },
  },
});

export default logger;
