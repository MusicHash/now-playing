import Redis from 'ioredis';

/**
 * Redis
 */
class RedisWrapper {
    _redisInstance = null;
    redisURI = null;
    logger = null;

    
    init(Logger, redisURI = null) {
        this.logger = Logger;
        this.redisURI = redisURI;

        return this;
    }


    async connect() {
        if (!this._isEnabled()) {
            this.logger.warn('Redis is not enabled');
            return Promise.resolve();
        }

        if (null !== this._redisInstance) {
            return this._redisInstance;
        }

        const redis = new Redis(this.redisURI, {
            retryStrategy: (times) => {
                this.logger.warn(`Redis reconnecting attempt: ${times}`);
                
                // Stop retrying after 10 attempts
                if (times > 10) {
                    this.logger.error('Redis: Maximum retry attempts reached, giving up');
                    return null;
                }

                return Math.min(times * 1000, 10000); // Exponential backoff with max 10s
            },
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });

        // Add error handlers
        redis.on('error', (error) => {
            this.logger.error({
                method: 'Redis.on.error',
                message: 'Redis connection error',
                error,
            });
        });

        redis.on('reconnecting', () => {
            this.logger.info('Redis reconnecting...');
        });

        redis.on('connect', () => {
            this.logger.info('Redis connected successfully');
        });

        this.logger.info('Redis Initialized');

        this._redisInstance = redis;

        return this._redisInstance;
    }


    _isEnabled() {
        return Boolean(this.redisURI);
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
        try {
            await this.connect();

            await this._redisInstance.hset(key, field, value);

            if (ttl) {
                await this._redisInstance.expire(key, ttl);
            }
        } catch (error) {
            this.logger.error({
                method: 'addHash',
                message: 'Failed to add hash to Redis',
                error,
                metadata: { key, field, ttl },
            });
            throw error;
        }
    }


    async getHash(key, field) {
        try {
            await this.connect();

            return await this._redisInstance.hget(key, field);
        } catch (error) {
            this.logger.error({
                method: 'getHash',
                message: 'Failed to get hash from Redis',
                error,
                metadata: { key, field },
            });
            // Return null instead of throwing to allow graceful degradation
            return null;
        }
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

        if (ttl > 0) {
            return await this._redisInstance.set(key, value, 'ex', ttl);
        } else {
            return await this._redisInstance.set(key, value);
        }
    }


    async del(key) {
        await this.connect();

        return await this._redisInstance.del(key);
    }
}


export default new RedisWrapper();
