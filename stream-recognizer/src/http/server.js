import express from 'express';
import { pingRedis } from '../lib/redis_store.js';

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
                    recognition: state?.recognition ?? null,
                    lastRun: state?.lastRun ?? null,
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
            recognition: state.recognition,
            lastRun: state.lastRun,
        });
    });

    return app;
}
