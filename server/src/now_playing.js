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

            this.logger.info('Application initialized successfully');
        } catch (error) {
            this.logger.error({
                method: '_initializeComponents',
                message: 'Failed to initialize application components',
                error,
            });
        }
    }

    async _connectToMetrics() {
        metricsWrapper.init(this.logger, process.env.INFLUX_URL, process.env.INFLUX_TOKEN, process.env.INFLUX_ORG, process.env.INFLUX_BUCKET);

        return this;
    }

    async _createEventEmitter() {
        this.logger.info('Creating EventEmitter...');

        await eventEmitterWrapper.init(this.logger).create();

        this.logger.info('Created to EventEmitter!');

        return this;
    }

    async _connectToRedis() {
        const redisURI = process.env.REDIS_URI;

        redisWrapper.init(this.logger, redisURI);

        if (redisURI) {
            this.logger.info('Connecting to Redis...');

            await redisWrapper.connect();

            this.logger.info('Connected to Redis!');
        } else {
            this.logger.warn('REDIS_URI is not defined, Redis will not be connected');
        }

        return this;
    }

    async _connectToMySQL() {
        const MySQL_URI = process.env.MYSQL_URI;

        if (MySQL_URI) {
            this.logger.info('Connecting to MySQL...');

            await MySQLWrapper.init(this.logger, MySQL_URI).connect();

            this.logger.info('Connected to MySQL!');
        } else {
            this.logger.warn('MYSQL_URI is not defined, MySQL will not be connected');
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
                    message: `HTTP Server up. Now go to http://localhost:${process.env.HTTP_PORT}/login in your browser`,
                }),
            )
            .on('close', () =>
                this.logger.info({
                    message: 'Closed HTTP Server!',
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
                message: 'Caught Unhandled Promise Rejection',
                error,
                metadata: {
                    promise: promise.toString(),
                },
            });

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
                message: 'Caught Uncaught Exception',
                error,
                stack: error.stack,
            });

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
            this.logger.warn('Process warning:', warning);
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
                message: 'Spotify initialized successfully',
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
