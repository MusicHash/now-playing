import newrelic from 'newrelic';
import { hostname } from 'node:os';

/**
 * Custom metrics and operational events via New Relic (replaces InfluxDB writes).
 */
class MetricsWrapper {
    logger = null;

    init(Logger) {
        this.logger = Logger;
    }

    _isNewRelicMetricsEnabled() {
        return process.env.NEW_RELIC_ENABLED !== 'false' && Boolean(process.env.NEW_RELIC_LICENSE_KEY);
    }

    /**
     * Report a measurement previously sent to Influx as a custom event with attributes.
     *
     * @param {string} measurementId
     * @param {{ type: string, key: string, value: string | number }[]} fields influx-style field list
     */
    report(measurementId, fields = []) {
        if (!this._isNewRelicMetricsEnabled()) {
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
            this.logger?.warn?.({
                message: 'New Relic custom metric failed',
                measurementId,
                err,
            });
        }
        return this;
    }

    /**
     * Time an async operation and report its duration + success flag.
     * Always fires (even on error) then re-throws.
     *
     * @param {string} measurementId
     * @param {() => Promise<any>} fn
     * @param {Record<string, string|number>} attrs  extra static attributes
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

    /**
     * Record a single occurrence / counter event with optional attributes.
     *
     * @param {string} measurementId
     * @param {Record<string, string|number>} attrs
     */
    increment(measurementId, attrs = {}) {
        return this.report(measurementId, [
            { key: 'count', value: 1 },
            ...Object.entries(attrs).map(([k, v]) => ({ key: k, value: v })),
        ]);
    }
}

export default new MetricsWrapper();
