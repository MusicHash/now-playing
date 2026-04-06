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
        if (!this._isEnabled()) {
            return this;
        }

        await this.connect();

        for (let i = 0; i < ids.length; i++) {
            const { key, value } = ids[i];
            await this._redisInstance.set(key, value);
        }

        return this;
    }


    async addHash(key, field, value, ttl = null) {
        if (!this._isEnabled()) {
            return;
        }

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
        if (!this._isEnabled()) {
            return null;
        }

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
        if (!this._isEnabled()) {
            return null;
        }

        await this.connect();

        return await this._redisInstance.hgetall(key);
    }


    async get(key) {
        if (!this._isEnabled()) {
            return null;
        }

        await this.connect();

        return await this._redisInstance.get(key);
    }


    async set(key, value, ttl = -1) {
        if (!this._isEnabled()) {
            return null;
        }

        await this.connect();

        if (ttl > 0) {
            return await this._redisInstance.set(key, value, 'ex', ttl);
        } else {
            return await this._redisInstance.set(key, value);
        }
    }


    async del(key) {
        if (!this._isEnabled()) {
            return null;
        }

        await this.connect();

        return await this._redisInstance.del(key);
    }

    /**
     * Delete all keys matching a Redis glob pattern using SCAN (not KEYS) plus batched UNLINK.
     * Refuses pattern "*" to avoid wiping the entire keyspace.
     *
     * @param {string} pattern e.g. "sql_cache:*"
     * @returns {Promise<{ deleted: number }>}
     */
    async purgeKeyPattern(pattern) {
        if (!this._isEnabled()) {
            return { deleted: 0 };
        }

        if (typeof pattern !== 'string' || pattern.trim() === '') {
            throw new Error('purgeKeyPattern: pattern must be a non-empty string');
        }
        if (pattern === '*') {
            throw new Error('purgeKeyPattern: refusing pattern "*" (would delete all keys)');
        }

        await this.connect();

        const redis = this._redisInstance;
        let cursor = '0';
        let deleted = 0;
        const countHint = 1000;
        const unlinkBatch = 500;

        try {
            do {
                const [nextCursor, keys] = await redis.scan(
                    cursor,
                    'MATCH',
                    pattern,
                    'COUNT',
                    countHint,
                );
                cursor = String(nextCursor);

                for (let i = 0; i < keys.length; i += unlinkBatch) {
                    const chunk = keys.slice(i, i + unlinkBatch);
                    if (chunk.length) {
                        deleted += await redis.unlink(...chunk);
                    }
                }
            } while (cursor !== '0');
        } catch (error) {
            this.logger.error({
                method: 'purgeKeyPattern',
                message: 'Failed to purge Redis keys by pattern',
                error,
                metadata: { pattern },
            });
            throw error;
        }

        return { deleted };
    }
}


export default new RedisWrapper();
