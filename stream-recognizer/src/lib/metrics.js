import newrelic from 'newrelic';
import { hostname } from 'node:os';

/**
 * Custom metrics as `ServerMetric` events (same shape as server) for New Relic dashboards.
 */
class MetricsWrapper {
    /** @type {import('pino').Logger | null} */
    logger = null;

    /** @param {import('pino').Logger} Logger */
    init(Logger) {
        this.logger = Logger;
    }

    _enabled() {
        return process.env.NEW_RELIC_ENABLED !== 'false' && Boolean(process.env.NEW_RELIC_LICENSE_KEY);
    }

    /**
     * @param {string} measurementId
     * @param {{ key: string; value: string | number }[]} fields
     */
    report(measurementId, fields = []) {
        if (!this._enabled()) {
            return this;
        }
        try {
            const attrs = {
                measurement: measurementId,
                host: hostname(),
            };
            for (const f of fields) {
                attrs[f.key] = f.value;
            }
            newrelic.recordCustomEvent('ServerMetric', attrs);
        } catch (err) {
            this.logger?.warn?.(
                {
                    err,
                    metadata: { measurementId },
                },
                'New Relic custom metric failed',
            );
        }
        return this;
    }

    /**
     * @param {string} measurementId
     * @param {() => Promise<any>} fn
     * @param {Record<string, string | number>} [attrs]
     */
    async timeIt(measurementId, fn, attrs = {}) {
        const start = Date.now();
        let success = 1;
        try {
            return await fn();
        } catch (err) {
            success = 0;
            throw err;
        } finally {
            this.report(measurementId, [
                { key: 'durationMs', value: Date.now() - start },
                { key: 'success', value: success },
                ...Object.entries(attrs).map(([k, v]) => ({ key: k, value: v })),
            ]);
        }
    }
}

export default new MetricsWrapper();
