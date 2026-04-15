import RedisWrapper from '../../../server/src/utils/redis_wrapper.js';

const HASH_FIELD_RECOGNITION = 'recognition';
const HASH_FIELD_LAST_RUN = 'lastRun';

/**
 * @typedef {object} RedisStore
 * @property {string} prefix
 * @property {string} hashFieldRecognition
 * @property {string} hashFieldLastRun
 * @property {(stationId: string) => string} key  Redis HASH: `{prefix}:{stationId}`
 * @property {(stationId: string) => Promise<{ recognition: object|null, lastRun: object|null }|null>} getState
 * @property {(stationId: string) => Promise<object|null>} getResult
 * @property {(stationId: string, payload: object) => Promise<void>} setResult
 * @property {(stationId: string, lastRun: object) => Promise<void>} setLastRun
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
 * @param {string|null|undefined} raw
 */
function isEmptyRaw(raw) {
    return raw === null || raw === undefined || raw === '';
}

/**
 * @param {string|null|undefined} raw
 * @returns {object|null}
 */
function parseJsonObjectOrNull(raw) {
    if (isEmptyRaw(raw)) {
        return null;
    }
    try {
        const v = JSON.parse(/** @type {string} */ (raw));
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            return /** @type {object} */ (v);
        }
    } catch {
        /* ignore */
    }
    return null;
}

/**
 * @param {import('pino').Logger} logger
 * @param {string} prefix
 * @returns {RedisStore}
 */
export function initRedisStore(logger, prefix) {
    const redisURI = process.env.REDIS_URI || null;
    RedisWrapper.init(logger, redisURI);
    const p = prefix || 'stream-recognizer:v2';

    return {
        prefix: p,
        hashFieldRecognition: HASH_FIELD_RECOGNITION,
        hashFieldLastRun: HASH_FIELD_LAST_RUN,

        /**
         * One Redis HASH per station: `{prefix}:{stationId}` with fields `recognition` and `lastRun`.
         * @param {string} stationId
         */
        key(stationId) {
            return `${this.prefix}:${stationId}`;
        },

        /**
         * Song change logic must use `recognition` only. `null` if the hash is missing or both fields are empty.
         *
         * @param {string} stationId
         */
        async getState(stationId) {
            const hkey = this.key(stationId);
            const all = await RedisWrapper.getAll(hkey);
            if (all === null || typeof all !== 'object') {
                return null;
            }

            const mainRaw = all[HASH_FIELD_RECOGNITION];
            const lastRunRaw = all[HASH_FIELD_LAST_RUN];

            if (isEmptyRaw(mainRaw) && isEmptyRaw(lastRunRaw)) {
                return null;
            }

            let recognition = null;
            if (!isEmptyRaw(mainRaw)) {
                try {
                    const { recognition: r } = normalizeStored(
                        JSON.parse(/** @type {string} */ (mainRaw)),
                    );
                    recognition = r;
                } catch {
                    recognition = null;
                }
            }

            const lastRun = parseJsonObjectOrNull(lastRunRaw);

            return { recognition, lastRun };
        },

        /**
         * @param {string} stationId
         * @param {object} payload
         */
        async setResult(stationId, payload) {
            await RedisWrapper.addHash(
                this.key(stationId),
                HASH_FIELD_RECOGNITION,
                JSON.stringify(payload),
            );
        },

        /**
         * @param {string} stationId
         * @param {object} lastRun
         */
        async setLastRun(stationId, lastRun) {
            await RedisWrapper.addHash(
                this.key(stationId),
                HASH_FIELD_LAST_RUN,
                JSON.stringify(lastRun),
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
