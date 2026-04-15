import RedisWrapper from '../../../server/src/utils/redis_wrapper.js';

/**
 * @typedef {object} RedisStore
 * @property {string} prefix
 * @property {(stationId: string) => string} key
 * @property {(stationId: string) => Promise<{ recognition: object }|null>} getState
 * @property {(stationId: string) => Promise<object|null>} getResult
 * @property {(stationId: string, payload: object) => Promise<void>} setResult
 */

/**
 * @param {unknown} parsed
 * @returns {{ recognition: object|null }}
 */
function normalizeStored(parsed) {
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { recognition: null };
    }
    const o = /** @type {Record<string, unknown>} */ (parsed);
    if ('recognition' in o) {
        const r = o.recognition;
        return {
            recognition:
                r !== null && typeof r === 'object' && !Array.isArray(r)
                    ? /** @type {object} */ (r)
                    : null,
        };
    }
    return { recognition: /** @type {object} */ (parsed) };
}

/**
 * @param {import('pino').Logger} logger
 * @param {string} prefix
 * @returns {RedisStore}
 */
export function initRedisStore(logger, prefix) {
    const redisURI = process.env.REDIS_URI || null;
    RedisWrapper.init(logger, redisURI);
    const p = prefix || 'stream-recognizer:v1';

    return {
        prefix: p,

        /** @param {string} stationId */
        key(stationId) {
            return `${this.prefix}:${stationId}`;
        },

        /**
         * Cached recognition (flat JSON in Redis). If the value is a wrapper
         * `{ recognition: { ... } }`, the inner object is used. Returns `null` if missing.
         *
         * @param {string} stationId
         */
        async getState(stationId) {
            const raw = await RedisWrapper.get(this.key(stationId));
            if (raw === null || raw === undefined || raw === '') {
                return null;
            }
            try {
                const { recognition } = normalizeStored(JSON.parse(raw));
                if (!recognition) {
                    return null;
                }
                return { recognition };
            } catch {
                return null;
            }
        },

        /**
         * @param {string} stationId
         * @param {object} payload
         */
        async setResult(stationId, payload) {
            await RedisWrapper.set(
                this.key(stationId),
                JSON.stringify(payload),
            );
        },

        /**
         * @param {string} stationId
         * @returns {Promise<object|null>}
         */
        async getResult(stationId) {
            const s = await this.getState(stationId);
            return s?.recognition ?? null;
        },
    };
}

/**
 * @param {import('pino').Logger} logger
 */
export async function pingRedis(logger) {
    if (!process.env.REDIS_URI) {
        return { ok: false, reason: 'REDIS_URI not set' };
    }
    try {
        await RedisWrapper.get('__stream_recognizer_health__');
        return { ok: true };
    } catch (e) {
        logger.error({ err: e }, 'redis ping failed');
        return { ok: false, reason: String(e?.message || e) };
    }
}
