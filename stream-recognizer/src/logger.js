import newrelic from 'newrelic';
import pino from 'pino';

/** Pino internal: serialized child bindings (e.g. requestID from logger.child). */
const chindingsSym = pino.symbols.chindingsSym;

/**
 * Pino stores `logger.child({ requestID })` bindings as a JSON fragment on the logger
 * (`chindingsSym`), not in the arguments passed to `logMethod`.
 *
 * @param {import('pino').Logger} log
 * @returns {Record<string, unknown>}
 */
function parsePinoChindings(log) {
  const raw = log[chindingsSym];
  if (!raw || typeof raw !== 'string' || raw.length < 2) {
    return {};
  }
  try {
    const inner = raw.startsWith(',') ? raw.slice(1) : raw;
    return JSON.parse(`{${inner}}`);
  } catch {
    return {};
  }
}

function nrForwardingEnabled() {
  return process.env.NEW_RELIC_ENABLED !== 'false' && Boolean(process.env.NEW_RELIC_LICENSE_KEY);
}

/** @param {unknown} value */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Flat attributes for New Relic `recordLogEvent` (primitives only).
 * Nested `metadata` is flattened as `metadata.<key>` (same convention as server).
 */
function nrPrimitiveAttrs(o) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    return out;
  }
  for (const [k, v] of Object.entries(o)) {
    if (k === 'msg' || k === 'message') {
      continue;
    }
    if (k === 'metadata' && isPlainObject(v)) {
      for (const [mk, mv] of Object.entries(v)) {
        if (
          mv === null ||
          typeof mv === 'string' ||
          typeof mv === 'number' ||
          typeof mv === 'boolean'
        ) {
          out[`metadata.${mk}`] = mv;
        }
      }
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

  Object.assign(payload, nrPrimitiveAttrs(parsePinoChindings(log)));

  const [first, second] = args;

  if (typeof first === 'string') {
    message = args.length > 1 ? args.join(' ') : first;
  } else if (first && typeof first === 'object' && !Array.isArray(first)) {
    {
      const errRaw = first.err ?? first.error;
      errObj = errRaw instanceof Error ? errRaw : undefined;
    }
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
