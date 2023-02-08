import Redis from 'ioredis';

/**
 * Redis
 */
class Redis {
    _redisInstance;
    redisURL;
    logger;

    constructor(redisURL, logger) {
      this.redisURL = redisURL;
      this.logger = logger;

      return this;
    }


    async getClient() {
      if (!this.isEnabled()) {
        return null;
      }

      return this._connect();
    }


    async _connect() {
      if (null !== this._redisInstance) {
        return this._redisInstance;
      }

      const redis = new Redis(this.redisURL, {
        retryStrategy(times) {
          this.logger.info(`Redis reconnecting attempt: ${times}`);

          return 5000;
        },
      });

      this.logger.info('Redis initialized');

      this._redisInstance = redis;

      return this._redisInstance;
    }


    isEnabled() {
      return Boolean(this.redisURL);
    }


    async function addSet(ids) {
      for (let i = 0; i < ids.length; i++) {
        const { key, value } = ids[i];
        await redis.set(key, value);
      }
    }


    async function get(key) {
      await connect();

      return redis.get(key);
    }


    async function set(key, value) {
      await connect();

      return redis.set(key, value);
    }
}


export default new Redis();
