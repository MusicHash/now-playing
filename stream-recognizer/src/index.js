import { createHttpServer } from './http/server.js';
import logger from './logger.js';
import { initRedisStore } from './lib/redis_store.js';
import { loadStations, envInt, defaultPollIntervalMs } from './config.js';
import { runStationTick } from './pipeline/orchestrator.js';
import { probeBinary, missingBinaryHint } from './lib/binaries.js';

const prefix = process.env.REDIS_KEY_PREFIX || 'stream-recognizer:v1';
const store = initRedisStore(logger, prefix);

const stations = loadStations();
const port = envInt('HTTP_PORT', 3847);
const defaultPoll = defaultPollIntervalMs();

const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
const fpcalcBin = process.env.FPCALC_BIN || 'fpcalc';
const anyStationEnabled = stations.some((s) => s.enabled !== false);

const app = createHttpServer({ logger, store, stations });
const server = app.listen(port, () => {
    logger.info({ port }, 'stream-recognizer HTTP listening');
    if (anyStationEnabled) {
        if (!probeBinary(ffmpegBin)) {
            logger.warn(
                { bin: ffmpegBin },
                `ffmpeg not found. ${missingBinaryHint('ffmpeg', 'FFMPEG_BIN')}`,
            );
        }
        if (!probeBinary(fpcalcBin)) {
            logger.warn(
                { bin: fpcalcBin },
                `fpcalc not found. ${missingBinaryHint('fpcalc', 'FPCALC_BIN')}`,
            );
        }
    }
});

/** @type {ReturnType<typeof setInterval>[]} */
const timers = [];

let stagger = 0;
for (const station of stations) {
    if (station.enabled === false) {
        continue;
    }
    const ms = station.intervalMs ?? defaultPoll;
    const delay = stagger;
    stagger += Math.min(5000, Math.floor(ms / 4));

    setTimeout(() => {
        runStationTick(station, store, logger).catch((e) => {
            logger.error({ err: e, station: station.id }, 'initial tick failed');
        });
        const t = setInterval(() => {
            runStationTick(station, store, logger).catch((e) => {
                logger.error({ err: e, station: station.id }, 'tick failed');
            });
        }, ms);
        timers.push(t);
    }, delay);
}

function shutdown() {
    logger.info('shutting down');
    for (const t of timers) {
        clearInterval(t);
    }
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
