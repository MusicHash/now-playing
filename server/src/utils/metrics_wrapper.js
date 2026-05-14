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
}

export default new MetricsWrapper();
