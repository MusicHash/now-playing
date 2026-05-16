import { Sentry, sentryEnabled } from './sentry.js';
import { createHttpServer } from './http/server.js';
import logger from './logger.js';
import metrics from './lib/metrics.js';
import { initRedisStore } from './lib/redis_store.js';
import {
    loadStations,
    loadRecognitionBlacklist,
    envInt,
    envString,
    defaultPollIntervalMs,
} from './config.js';
import { runStationTick } from './pipeline/orchestrator.js';
import { probeBinary, missingBinaryHint } from './lib/binaries.js';

metrics.init(logger);

const prefix = process.env.REDIS_KEY_PREFIX || 'stream-recognizer:v2';
const store = initRedisStore(logger, prefix);

const stations = loadStations();
const recognitionBlacklist = loadRecognitionBlacklist();
const port = envInt('HTTP_PORT', 3847);
const listenHost = envString('HTTP_HOST', '');
const defaultPoll = defaultPollIntervalMs();

const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
const fpcalcBin = process.env.FPCALC_BIN || 'fpcalc';
const anyStationEnabled = stations.some((s) => s.enabled !== false);

const app = createHttpServer({ logger, store, stations });
const server = listenHost
    ? app.listen(port, listenHost, onListen)
    : app.listen(port, onListen);

function onListen() {
    logger.info(
        {
            method: 'bootstrap.onListen',
            metadata: listenHost
                ? { port, host: listenHost, component: 'bootstrap' }
                : { port, component: 'bootstrap' },
        },
        'HTTP listening',
    );
    metrics.report('StreamRecognizerStarted', [
        { key: 'started', value: 1 },
        { key: 'port', value: port },
    ]);
    if (anyStationEnabled) {
        if (!probeBinary(ffmpegBin)) {
            logger.warn(
                {
                    method: 'bootstrap.checkBinary',
                    metadata: { bin: ffmpegBin, component: 'bootstrap' },
                },
                `ffmpeg not found. ${missingBinaryHint('ffmpeg', 'FFMPEG_BIN')}`,
            );
        }
        if (!probeBinary(fpcalcBin)) {
            logger.warn(
                {
                    method: 'bootstrap.checkBinary',
                    metadata: { bin: fpcalcBin, component: 'bootstrap' },
                },
                `fpcalc not found. ${missingBinaryHint('fpcalc', 'FPCALC_BIN')}`,
            );
        }
    }
}

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
        runStationTick(station, store, logger, {
            recognitionBlacklist,
        }).catch((e) => {
            logger.error(
                {
                    method: 'bootstrap.initialStationTick',
                    err: e,
                    metadata: { stationID: station.id, component: 'bootstrap' },
                },
                'Initial station tick failed',
            );
        });
        const t = setInterval(() => {
            runStationTick(station, store, logger, {
                recognitionBlacklist,
            }).catch((e) => {
                logger.error(
                    {
                        method: 'bootstrap.scheduledStationTick',
                        err: e,
                        metadata: { stationID: station.id, component: 'bootstrap' },
                    },
                    'Scheduled station tick failed',
                );
            });
        }, ms);
        timers.push(t);
    }, delay);
}

function shutdown() {
    logger.info(
        { method: 'bootstrap.shutdown', metadata: { component: 'bootstrap' } },
        'Shutting down',
    );
    for (const t of timers) {
        clearInterval(t);
    }
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (sentryEnabled) {
    process.on('unhandledRejection', (reason) => {
        const err =
            reason instanceof Error
                ? reason
                : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
        Sentry.captureException(err, { tags: { handler: 'unhandledRejection' } });
    });

    process.on('uncaughtException', (error) => {
        Sentry.captureException(error, { tags: { handler: 'uncaughtException' } });
    });
}
