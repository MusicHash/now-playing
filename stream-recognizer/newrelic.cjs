'use strict';

/**
 * New Relic for ESM app — use `.cjs` so the agent can `require()` config.
 * Default app name differs from the API server; same license key in `.env`.
 */
function resolveNewRelicProxy() {
  if (Object.prototype.hasOwnProperty.call(process.env, 'NEW_RELIC_PROXY_URL')) {
    const explicit = process.env.NEW_RELIC_PROXY_URL.trim();
    return explicit || undefined;
  }
  const shared = (process.env.PROXY_URI || '').trim();
  return shared || undefined;
}

const newRelicProxy = resolveNewRelicProxy();

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'stream-recognizer'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  agent_enabled: process.env.NEW_RELIC_ENABLED !== 'false',
  ...(newRelicProxy ? { proxy: newRelicProxy } : {}),
  logging: {
    level: 'info',
  },
  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
    },
    local_decorating: {
      enabled: false,
    },
  },
  distributed_tracing: {
    enabled: true,
  },
  worker_threads: {
    enabled: true,
  },
  instrumentation: {
    pino: {
      enabled: false,
    },
  },
};
