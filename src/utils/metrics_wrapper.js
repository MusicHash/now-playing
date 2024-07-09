import { InfluxDB, Point, HttpError } from '@influxdata/influxdb-client';
import { hostname } from 'node:os';

/**
 * Metrics Wrapper - influxdb v2
 */
class MetricsWrapper {
    _mericsInstance = null;
    _mericsWrite = null;
    _isEnabled = false;

    logger = null;

    
    init(Logger, url, token, org, bucket) {
        this.logger = Logger;

        try {
          this._initInfluxDB(url, token, org, bucket);
        } catch (error) {
          this.logger.error(error);
        }
    }


    _initInfluxDB(url, token, org, bucket) {
        if (!url || !token || !org || !bucket) {
            this.logger.warn('InfluxDB is not configured');
            return this;
        }

        this.logger.info('InfluxDB is configured, initializing...');
        this._isEnabled = true;

        this._mericsInstance = new InfluxDB({ url, token });

        /**
         * Create a write client from the getWriteApi method.
         * Provide your `org` and `bucket`.
         **/
        this._mericsWrite = this._mericsInstance.getWriteApi(org, bucket);


        /**
         * Flush pending writes and close writeApi.
         **/
        this._mericsWrite.close().then(() => {
          this.logger.debug('InfluxDB WRITE FINISHED');
        });

        this._mericsWrite.useDefaultTags({
          location: hostname()
        });

        return this;
    }


    report(measurement_id, fields = []) {
      if (!this._isEnabled) {
        console.log('InfluxDB report failed, not initilized yet. Args:' + arguments);
        return;
      }

      /**
       * Create a point and write it to the buffer.
       **/
      const pointData = new Point(measurement_id);

      for (let i = 0; i < fields.length; i++) {
        pointData[fields[i].type](fields[i].key, fields[i].value);
      }
      
      console.log(`Metric Point inspection: ${pointData}`);

      this._mericsWrite.writePoint(pointData);
      this._mericsWrite.flush();

      return this;
    }
}

export default new MetricsWrapper();
