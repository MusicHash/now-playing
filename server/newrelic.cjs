'use strict';

/**
 * New Relic agent config (CommonJS). Rename/extension `.cjs` is required when the
 * app package uses `"type": "module"` — see NR ESM docs.
 *
 * Env: NEW_RELIC_APP_NAME, NEW_RELIC_LICENSE_KEY, NEW_RELIC_ENABLED, NEW_RELIC_PROXY_URL.
 *
 * HTTP CONNECT proxy: `http://user:pass@host:port`. The proxy terminates CONNECT and opens
 * TLS to New Relic; your machine only needs DNS/routing to the proxy (avoids LAN sinkholes
 * for *.newrelic.com). If `NEW_RELIC_PROXY_URL` is unset, uses `PROXY_URI`. If set empty,
 * NR uses no proxy even when `PROXY_URI` is set.
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
  app_name: [process.env.NEW_RELIC_APP_NAME || 'now-playing-server'],
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
    /* Keeps stdout JSON clean; forwarding still sends logs and NR correlates in the UI. */
    local_decorating: {
      enabled: false,
    },
  },
  distributed_tracing: {
    enabled: true,
  },
  /**
   * Pino-pretty uses a worker thread; without this the agent may load in the
   * worker and refuse to start (see newrelic_agent.log).
   */
  worker_threads: {
    enabled: true,
  },
  /**
   * Automatic Pino instrumentation often misses logs with ESM + pino-pretty/worker.
   * We forward via `newrelic.recordLogEvent` from `logger.js` instead.
   */
  instrumentation: {
    pino: {
      enabled: false,
    },
  },
};
