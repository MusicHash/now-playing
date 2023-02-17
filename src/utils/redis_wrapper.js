import Redis from 'ioredis';

/**
 * Redis
 */
class RedisWrapper {
    _redisInstance = null;
    redisURL = null;
    logger = null;

    init(Logger, redisURL = null) {
        this.logger = Logger;
        this.redisURL = redisURL;

        return this;
    }

    async connect() {
        if (!this.isEnabled()) {
            this.logger.info('Redis is not enabled');
            return Promise.resolve();
        }

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

    async addSet(ids) {
        await this.connect();

        for (let i = 0; i < ids.length; i++) {
            const { key, value } = ids[i];
            await this._redisInstance.set(key, value);
        }

        return this;
    }

    async addHash(key, field, value, ttl = null) {
        await this.connect();

        await this._redisInstance.hset(key, field, value);

        if (ttl) {
            await this._redisInstance.expire(key, ttl);
        }
    }

    async getHash(key, field) {
        await this.connect();

        return await this._redisInstance.hget(key, field);
    }

    async getAll(key) {
        await this.connect();

        return await this._redisInstance.hgetall(key);
    }

    async get(key) {
        await this.connect();

        return await this._redisInstance.get(key);
    }

    async set(key, value, ttl = -1) {
        await this.connect();

        return await this._redisInstance.set(key, value, 'ex', ttl);
    }

    async del(key) {
        await this.connect();

        return await this._redisInstance.del(key);
    }
}

export default new RedisWrapper();
