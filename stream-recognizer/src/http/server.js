import express from 'express';
import { pingRedis } from '../lib/redis_store.js';

/**
 * Same instant as ISO UTC, formatted in the process/OS default timezone with numeric offset
 * (e.g. `2026-04-07T19:13:39.876+03:00`).
 * @param {unknown} isoUtc
 * @returns {string|undefined}
 */
function isoUtcToLocalOffsetIso(isoUtc) {
    if (typeof isoUtc !== 'string' || !isoUtc) {
        return undefined;
    }
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) {
        return undefined;
    }
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const y = d.getFullYear();
    const mo = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const mi = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    const msec = pad(d.getMilliseconds(), 3);
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const offH = pad(Math.floor(abs / 60));
    const offM = pad(abs % 60);
    return `${y}-${mo}-${day}T${h}:${mi}:${s}.${msec}${sign}${offH}:${offM}`;
}

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
 * Adds `atLocal` next to `at` when serializing (not stored in Redis).
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
        const list = await Promise.all(
            stations.map(async (s) => {
                const state = await store.getState(s.id);
                return {
                    id: s.id,
                    enabled: s.enabled !== false,
                    intervalMs: s.intervalMs ?? null,
                    streamUrl: s.streamUrl,
                    recognition: recognitionWithLocalTime(
                        state?.recognition ?? null,
                    ),
                    lastRun: lastRunWithLocalTime(state?.lastRun ?? null),
                };
            }),
        );
        res.json({ stations: list });
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

    return app;
}
