import express from 'express';
import { attachSentryToExpress } from '../sentry.js';
import { isoUtcToLocalOffsetIso } from '../lib/local_time.js';
import { pingRedis } from '../lib/redis_store.js';

/**
 * Adds `updatedAtLocal` next to `updatedAt` when serializing (not stored in Redis).
 * @param {object|null} recognition
 */
function recognitionWithLocalTime(recognition) {
    if (!recognition || typeof recognition !== 'object') {
        return recognition;
    }
    const local = isoUtcToLocalOffsetIso(
        /** @type {{ updatedAt?: unknown }} */ (recognition).updatedAt,
    );
    if (local === undefined) {
        return recognition;
    }
    return { ...recognition, updatedAtLocal: local };
}

/**
 * Adds `atLocal` next to `at` when serializing (not altering stored Redis shape).
 * @param {object|null} lastRun
 */
function lastRunWithLocalTime(lastRun) {
    if (!lastRun || typeof lastRun !== 'object') {
        return lastRun;
    }
    const local = isoUtcToLocalOffsetIso(
        /** @type {{ at?: unknown }} */ (lastRun).at,
    );
    if (local === undefined) {
        return lastRun;
    }
    return { ...lastRun, atLocal: local };
}

/**
 * Safe object key for `GET /stations` payload: no `.`, truncated before first `-`,
 * then only `[a-zA-Z0-9_]` (other chars become `_`).
 * @param {string} id
 */
function stationResponseKey(id) {
    let k = String(id);
    const dash = k.indexOf('-');
    if (dash !== -1) {
        k = k.slice(0, dash);
    }
    k = k.replace(/\./g, '');
    k = k.replace(/[^a-zA-Z0-9_]/g, '_');
    return k || '_';
}

/**
 * @param {object} opts
 * @param {import('pino').Logger} opts.logger
 * @param {import('../lib/redis_store.js').RedisStore} opts.store
 * @param {import('../types.js').StationConfig[]} opts.stations
 */
export function createHttpServer({ logger, store, stations }) {
    const app = express();

    const cors = process.env.CORS_ORIGIN;
    if (cors) {
        app.use((req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', cors);
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            if (req.method === 'OPTIONS') {
                res.status(204).end();
                return;
            }
            next();
        });
    }

    app.get('/health', async (req, res) => {
        const redis = await pingRedis(logger);
        res.json({
            ok: true,
            redis: redis.ok ? 'up' : 'down',
            redisDetail: redis.reason || undefined,
        });
    });

    app.get('/stations', async (req, res) => {
        const entries = await Promise.all(
            stations.map(async (s) => {
                const state = await store.getState(s.id);
                const payload = {
                    id: s.id,
                    enabled: s.enabled !== false,
                    intervalMs: s.intervalMs ?? null,
                    streamUrl: s.streamUrl,
                    recognition: recognitionWithLocalTime(
                        state?.recognition ?? null,
                    ),
                    lastRun: lastRunWithLocalTime(state?.lastRun ?? null),
                };
                return [stationResponseKey(s.id), payload];
            }),
        );
        res.json({ stations: Object.fromEntries(entries) });
    });

    app.get('/stations/:id', async (req, res) => {
        const id = req.params.id;
        const configured = stations.some((s) => s.id === id);
        if (!configured) {
            res.status(404).json({ error: 'unknown station id' });
            return;
        }

        const state = await store.getState(id);
        if (!state) {
            res.status(404).json({ error: 'no data yet' });
            return;
        }

        res.json({
            id,
            recognition: recognitionWithLocalTime(state.recognition),
            lastRun: lastRunWithLocalTime(state.lastRun),
        });
    });

    attachSentryToExpress(app);

    return app;
}
