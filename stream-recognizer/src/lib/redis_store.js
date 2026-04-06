import RedisWrapper from '../../../server/src/utils/redis_wrapper.js';

/**
 * @typedef {object} RedisStore
 * @property {string} prefix
 * @property {(stationId: string) => string} key
 * @property {(stationId: string) => Promise<{ recognition: object|null, lastRun: object|null }|null>} getState
 * @property {(stationId: string) => Promise<object|null>} getResult  recognition only (legacy flat JSON)
 * @property {(stationId: string, partial: { recognition?: object|null, lastRun?: object|null }) => Promise<void>} mergeState
 * @property {(stationId: string, lastRun: object) => Promise<void>} setLastRun
 * @property {(stationId: string, payload: object) => Promise<void>} setResult
 */

/**
 * @param {unknown} parsed
 * @returns {{ recognition: object|null, lastRun: object|null }}
 */
function normalizeStored(parsed) {
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { recognition: null, lastRun: null };
    }
    const o = /** @type {Record<string, unknown>} */ (parsed);
    if ('recognition' in o) {
        const r = o.recognition;
        const l = o.lastRun;
        return {
            recognition:
                r !== null && typeof r === 'object' && !Array.isArray(r)
                    ? /** @type {object} */ (r)
                    : null,
            lastRun:
                l !== null && typeof l === 'object' && !Array.isArray(l)
                    ? /** @type {object} */ (l)
                    : null,
        };
    }
    return { recognition: /** @type {object} */ (parsed), lastRun: null };
}

/**
 * @param {import('pino').Logger} logger
 * @param {string} prefix
 * @returns {RedisStore}
 */
export function initRedisStore(logger, prefix) {
    const redisURI = process.env.REDIS_URI || null;
    RedisWrapper.init(logger, redisURI);
    return {
        prefix: prefix || 'stream-recognizer:v1',

        /** @param {string} stationId */
        key(stationId) {
            return `${this.prefix}:${stationId}`;
        },

        /**
         * Full Redis document: `{ recognition, lastRun }`. Legacy flat JSON is treated as `recognition` only.
         *
         * @param {string} stationId
         * @returns {Promise<{ recognition: object|null, lastRun: object|null }|null>} `null` if key missing
         */
        async getState(stationId) {
            const raw = await RedisWrapper.get(this.key(stationId));
            if (raw === null || raw === undefined || raw === '') {
                return null;
            }
            try {
                return normalizeStored(JSON.parse(raw));
            } catch {
                return null;
            }
        },

        /**
         * @param {string} stationId
         * @param {{ recognition?: object|null, lastRun?: object|null }} partial
         */
        async mergeState(stationId, partial) {
            const prev = (await this.getState(stationId)) ?? {
                recognition: null,
                lastRun: null,
            };
            const next = {
                recognition:
                    partial.recognition !== undefined
                        ? partial.recognition
                        : prev.recognition,
                lastRun:
                    partial.lastRun !== undefined ? partial.lastRun : prev.lastRun,
            };
            await RedisWrapper.set(
                this.key(stationId),
                JSON.stringify(next),
            );
        },

        /**
         * @param {string} stationId
         * @param {object} lastRun
         */
        async setLastRun(stationId, lastRun) {
            await this.mergeState(stationId, { lastRun });
        },

        /**
         * Recognition payload only (what used to be the whole Redis value).
         *
         * @param {string} stationId
         * @returns {Promise<object|null>}
         */
        async getResult(stationId) {
            const s = await this.getState(stationId);
            return s?.recognition ?? null;
        },

        /**
         * @param {string} stationId
         * @param {object} payload
         */
        async setResult(stationId, payload) {
            await this.mergeState(stationId, { recognition: payload });
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
