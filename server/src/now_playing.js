import { Sentry, attachSentryToExpress, sentryEnabled } from './sentry.js';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import logger from './utils/logger.js';
import redisWrapper from './utils/redis_wrapper.js';
import MySQLWrapper from './utils/mysql_wrapper.js';
import eventEmitterWrapper from './utils/event_emitter_wrapper.js';
import metricsWrapper from './utils/metrics_wrapper.js';
import { terminate } from './utils/terminate.js';

import StationLoggerActor from './lib/actors/station_logger_actor.js';
import SpotifyActor from './lib/actors/spotify_actor.js';
import { subscriptions as playlistSubscriptions } from './lib/playlist.js';
import Spotify from './lib/providers/spotify.js';

import createRoutes from './routes/index.js';
import Scheduler from './scheduler.js';
import requestIDMiddleware from './middleware/request_id.js';

/**
 * NowPlaying
 */
class NowPlaying {
    logger;
    app;
    server;
    scheduler;

    constructor(Logger) {
        this.logger = Logger;
        this.app = express();
        
        this.app.disable('x-powered-by');
        this.app.use(requestIDMiddleware());

        this.scheduler = new Scheduler(this.logger);

        const server = this._getExpressServer(this.app);
        this._terminateHandle(server);

        this._initializeComponents();
    }

    async _initializeComponents() {
        try {
            await this._createEventEmitter();
            this.app.use('/api', createRoutes(this.logger));
            this._serveClient();
            attachSentryToExpress(this.app);

            await this._connectToRedis();
            await this._connectToMySQL();
            MySQLWrapper.setCache(redisWrapper);
            await this._connectToMetrics();

            await this._spotifyConnect();
            this.scheduler.start();
            playlistSubscriptions();

            new StationLoggerActor(this.logger).init();
            new SpotifyActor(this.logger).init();

            metricsWrapper.report('app_started', [
                {
                    type: 'intField',
                    key: 'started',
                    value: 1,
                },
            ]);

            this.logger.info({
                method: 'NowPlaying._initializeComponents',
                message: 'Application initialized successfully',
            });
        } catch (error) {
            this.logger.error({
                method: '_initializeComponents',
                message: 'Failed to initialize application components',
                error,
            });
            if (sentryEnabled) {
                Sentry.captureException(error);
            }
        }
    }

    async _connectToMetrics() {
        metricsWrapper.init(this.logger);

        return this;
    }

    async _createEventEmitter() {
        this.logger.info({
            method: 'NowPlaying._createEventEmitter',
            message: 'Creating event emitter',
        });

        await eventEmitterWrapper.init(this.logger).create();

        this.logger.info({
            method: 'NowPlaying._createEventEmitter',
            message: 'Event emitter ready',
        });

        return this;
    }

    async _connectToRedis() {
        const redisURI = process.env.REDIS_URI;

        redisWrapper.init(this.logger, redisURI);

        if (redisURI) {
            this.logger.info({
                method: 'NowPlaying._connectToRedis',
                message: 'Connecting to Redis',
            });

            await redisWrapper.connect();

            this.logger.info({
                method: 'NowPlaying._connectToRedis',
                message: 'Connected to Redis',
            });
        } else {
            this.logger.warn({
                method: 'NowPlaying._connectToRedis',
                message: 'REDIS_URI not set, Redis disabled',
            });
        }

        return this;
    }

    async _connectToMySQL() {
        const MySQL_URI = process.env.MYSQL_URI;

        if (MySQL_URI) {
            this.logger.info({
                method: 'NowPlaying._connectToMySQL',
                message: 'Connecting to MySQL',
            });

            await MySQLWrapper.init(this.logger, MySQL_URI).connect();

            this.logger.info({
                method: 'NowPlaying._connectToMySQL',
                message: 'Connected to MySQL',
            });
        } else {
            this.logger.warn({
                method: 'NowPlaying._connectToMySQL',
                message: 'MYSQL_URI not set, MySQL disabled',
            });
        }

        return this;
    }

    _serveClient() {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const clientDist = path.join(__dirname, '../../client/dist');

        this.app.use(express.static(clientDist));
        this.app.get('*all', (req, res) => {
            res.sendFile(path.join(clientDist, 'index.html'));
        });
    }

    _getExpressServer(app) {
        return http
            .createServer(app)
            .listen(process.env.HTTP_PORT, () =>
                this.logger.info({
                    method: 'NowPlaying._getExpressServer',
                    message: 'HTTP server listening',
                    metadata: { port: process.env.HTTP_PORT },
                }),
            )
            .on('close', () =>
                this.logger.info({
                    method: 'NowPlaying._getExpressServer',
                    message: 'HTTP server closed',
                }),
            );
    }

    _terminateHandle(server) {
        const exitHandler = terminate(
            server,
            {
                coredump: false,
            },
            () => {
                this.scheduler.stop();
            },
        );

        process.stdin.resume();

        process.on('unhandledRejection', (error, promise) => {
            this.logger.error({
                method: 'unhandledRejection',
                message: 'Unhandled promise rejection',
                error,
                metadata: {
                    promise: String(promise),
                },
            });

            if (sentryEnabled) {
                Sentry.captureException(error, {
                    tags: { handler: 'unhandledRejection' },
                    extra: { promise: String(promise) },
                });
            }

            if (metricsWrapper) {
                try {
                    metricsWrapper.report('unhandled_rejection', [
                        {
                            type: 'intField',
                            key: 'count',
                            value: 1,
                        },
                        {
                            type: 'stringField',
                            key: 'error_message',
                            value: error.message || 'Unknown error',
                        },
                    ]);
                } catch (_) {}
            }
        });

        process.on('uncaughtException', (error) => {
            this.logger.error({
                method: 'uncaughtException',
                message: 'Uncaught exception',
                error,
            });

            if (sentryEnabled) {
                Sentry.captureException(error, { tags: { handler: 'uncaughtException' } });
            }

            if (metricsWrapper) {
                try {
                    metricsWrapper.report('uncaught_exception', [
                        {
                            type: 'intField',
                            key: 'count',
                            value: 1,
                        },
                        {
                            type: 'stringField',
                            key: 'error_message',
                            value: error.message || 'Unknown error',
                        },
                    ]);
                } catch (_) {}
            }

            this.scheduler.stop();

            setTimeout(() => process.exit(1), 1000);
        });

        process.on('warning', (warning) => {
            this.logger.warn({
                method: 'process.warning',
                message: 'Process emitted warning',
                metadata: { warningMessage: warning?.message ?? String(warning) },
            });
        });

        ['SIGTERM', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGHUP'].forEach((eventType) => {
            process.on(eventType, exitHandler.bind(null, eventType));
        });

        return this;
    }

    async _spotifyConnect() {
        try {
            await Spotify.connect();
            this.logger.info({
                method: 'NowPlaying._spotifyConnect',
                message: 'Spotify client ready',
            });
        } catch (error) {
            this.logger.error({
                method: '_spotifyConnect',
                message: 'Failed to connect to Spotify',
                error,
            });
        }
    }
}

export default new NowPlaying(logger);
