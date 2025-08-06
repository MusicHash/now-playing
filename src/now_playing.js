import http from 'http';
import express from 'express';
import prettier from 'prettier';

import logger from './utils/logger.js';
import redisWrapper from './utils/redis_wrapper.js';
import MySQLWrapper from './utils/mysql_wrapper.js';
import eventEmitterWrapper from './utils/event_emitter_wrapper.js';
import metricsWrapper from './utils/metrics_wrapper.js';
import { terminate } from './utils/terminate.js';

import { crawlAllStationsToNotifyTrackChanges, refreshChartLocal, refreshChartRemote, updatePlaylistContentForAllStations, refreshChartAll, getChartInfo } from './lib/fetch_sources.js';
import StationLoggerActor from './lib/actors/station_logger_actor.js';
import SpotifyActor from './lib/actors/spotify_actor.js';
import { stations, charts } from '../config/sources.js';

import { slicePlaylist, sliceAllPlaylists, subscriptions as playlistSubscriptions } from './lib/playlist.js';

import Spotify from './lib/providers/spotify.js';

/**
 * NowPlaying
 */
class NowPlaying {
    logger;
    app;
    server;
    intervals = [];

    constructor(Logger) {
        this.logger = Logger;
        this.app = express();
        const server = this._getExpressServer(this.app);
        this._terminateHandle(server);

        // Initialize components with proper error handling
        this._initializeComponents();
    }

    async _initializeComponents() {
        try {
            // init
            await this._createEventEmitter();
            this._loadRoutes();

            await this._connectToRedis();
            await this._connectToMySQL();
            await this._connectToMetrics();

            await this._spotifyConnect();
            this._loadAutomaticTimers();
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
            // Don't exit, let the application try to continue
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

        if (redisURI) {
            this.logger.info('Connecting to Redis...');

            await redisWrapper.init(this.logger, redisURI).connect();

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
        // Handle exit process
        const exitHandler = terminate(
            server,
            {
                coredump: false,
            },
            () => {
                // Cleanup intervals when terminating
                this.intervals.forEach((interval) => {
                    if (interval) clearInterval(interval);
                });
            },
        );

        // Start reading from stdin so we don't exit.
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

            // Report to metrics if available
            if (metricsWrapper) {
                metricsWrapper
                    .report('unhandled_rejection', [
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
                    ])
                    .catch(() => {
                        // Ignore metrics errors to prevent recursive issues
                    });
            }

            // Don't exit immediately, let the application try to recover
        });

        process.on('uncaughtException', (error) => {
            this.logger.error({
                method: 'uncaughtException',
                message: 'Caught Uncaught Exception',
                error,
                stack: error.stack,
            });

            // Report to metrics if available
            if (metricsWrapper) {
                metricsWrapper
                    .report('uncaught_exception', [
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
                    ])
                    .catch(() => {
                        // Ignore metrics errors to prevent recursive issues
                    });
            }

            // Cleanup intervals before exiting
            this.intervals.forEach((interval) => {
                if (interval) clearInterval(interval);
            });

            // Give some time for cleanup before exiting
            setTimeout(() => process.exit(1), 1000);
        });

        // Handle process warnings
        process.on('warning', (warning) => {
            this.logger.warn('Process warning:', warning);
        });

        ['SIGTERM', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGHUP'].forEach((eventType) => {
            process.on(eventType, exitHandler.bind(null, eventType));
        });

        return this;
    }

    async triggerCrawlAllStationsToNotifyTrackChanges() {
        try {
            let res = await crawlAllStationsToNotifyTrackChanges();

            this.logger.info({
                method: 'triggerCrawlAllStationsToNotifyTrackChanges',
                message: res,
            });
        } catch (error) {
            this.logger.error({
                method: 'triggerCrawlAllStationsToNotifyTrackChanges',
                message: 'Could not refresh stations',
                error,
            });
        }
    }

    async triggerUpdatePlaylistContentForAllStations() {
        try {
            let res = await updatePlaylistContentForAllStations();

            this.logger.info({
                method: 'triggerUpdatePlaylistContentForAllStations',
                message: res,
            });
        } catch (error) {
            this.logger.error({
                method: 'triggerUpdatePlaylistContentForAllStations',
                message: 'Could not update stations playlist',
                error,
            });
        }
    }

    async triggerRefreshChartAll() {
        try {
            let res = await refreshChartAll();

            this.logger.info({
                method: 'triggerRefreshChartAll',
                message: res,
            });
        } catch (error) {
            this.logger.error({
                method: 'triggerRefreshChartAll',
                message: 'Could not refresh charts',
                error,
            });
        }
    }

    async triggerRefreshChartRemote(chart) {
        try {
            let res = await refreshChartRemote(chart);

            this.logger.info({
                method: 'triggerRefreshChartRemote',
                message: res,
                args: [...arguments],
            });
        } catch (error) {
            this.logger.error({
                method: 'triggerRefreshChartRemote',
                message: 'Could not refresh chart',
                error,
                metadata: {
                    args: [...arguments],
                },
            });
        }
    }

    async triggerSliceAllPlaylist(chart) {
        try {
            let res = await sliceAllPlaylists();

            this.logger.info({
                method: 'triggerSliceAllPlaylist',
                message: res,
                metadata: {
                    args: [...arguments],
                },
            });
        } catch (error) {
            this.logger.error({
                method: 'triggerSliceAllPlaylist',
                message: 'Could not slice chart',
                error,
                metadata: {
                    args: [...arguments],
                },
            });
        }
    }

    _loadRoutes() {
        this.app.get('/spotify/login', async (req, res) => {
            res.redirect(await Spotify.createAuthorizeURL());
        });

        this.app.get('/spotify/auth/redirect', async (req, res) => {
            const error = req.query.error;
            const code = req.query.code;

            Spotify.auth(code, error, res);
        });

        this.app.get('/actions', async (req, res) => {
            let links = {
                '/spotify/login': 'Re-Login',
                '/crawl_playlists_manually': 'Crawl Stations (all)',
                '/update_playlists_manually': 'Update Stations Manually (all)',
                '/playlist/refresh_charts/all': 'Refresh Charts - in batches (all)',
                '/playlist/slice/all': 'Shorten the playlist to limit (all)',
                '/debug_channels': 'Debug Channels',
            };

            let html = Object.keys(links)
                .map(function (result, item) {
                    return `<li><a href="${result}">${links[result]}</a></li>`;
                }, 0)
                .join('\r\n');

            let channelsList = Object.assign({}, stations, charts);
            html += "<li style='margin-top:30px'>Channels List:</li>";
            for (let channelID in channelsList) {
                html += `<li>${channelID} (<a href="/debug/fetch/${channelID}">Debug Fetch</a>)</li>`;
            }

            res.send(`<ul>${html}</ul>`);
        });

        this.app.get('/debug/fetch/:chartID', async (req, res) => {
            let chartID = req.params.chartID;
            let output = [];

            try {
                let items = Object.assign({}, stations, charts);
                let props = items[chartID];
                let rawURL = Buffer.from(props.scraper.url, 'base64').toString('ascii'); // decode

                let formattedStationParserInfo = await prettier.format(JSON.stringify(props), { semi: false, parser: 'json' });
                output.push(`formattedStationParserInfo: ${chartID}`);
                output.push(`URL: ${rawURL}`);
                output.push(formattedStationParserInfo);

                let chartRPC = await getChartInfo(chartID, props);
                let formattedRPCInfo = await prettier.format(JSON.stringify(chartRPC), { semi: false, parser: 'json' });

                output.push(`chartRPC: ${chartID}`);
                output.push(formattedRPCInfo);
            } catch (error) {
                output.push(`Error: ${chartID}`);
                output.push(error);
            }

            res.send(`<pre>${output.join('\n')}</pre>`);
        });

        this.app.get('/crawl_playlists_manually', async (req, res) => {
            this.triggerCrawlAllStationsToNotifyTrackChanges();
            res.send('Success, triggerCrawlAllStationsToNotifyTrackChanges!');
        });

        this.app.get('/update_playlists_manually', async (req, res) => {
            this.triggerUpdatePlaylistContentForAllStations();
            res.send('Success, triggerUpdatePlaylistContentForAllStations!');
        });

        this.app.get('/refresh_charts_manually/:chart', async (req, res) => {
            let chart = req.params.chart;

            this.triggerRefreshChartRemote(chart);
            res.send(['Success, triggerRefreshChartRemote!', chart]);
        });

        this.app.get('/playlist/refresh_charts/all', async (req, res) => {
            this.triggerRefreshChartAll();
            res.send(['Success, Queued ALL charts for refresh. (triggerRefreshChartAll)']);
        });

        this.app.get('/playlist/slice/:playlist/:limit', async (req, res) => {
            let playlist = req.params.playlist;
            let limit = req.params.limit;

            await this.slicePlaylist(playlist, limit);
            res.send(['Success, slicePlaylist!', playlist, limit]);
        });

        this.app.get('/playlist/slice/all', async (req, res) => {
            this.triggerSliceAllPlaylist();
            res.send(['Success, Queued ALL playlists for slice. (sliceAllPlaylist)']);
        });

        return this;
    }

    _loadAutomaticTimers() {
        // now playing, crawl stations songs
        const stationInterval = setInterval(async () => {
            try {
                await this.triggerCrawlAllStationsToNotifyTrackChanges();

                this.logger.info({
                    message: '[AUTO REFRESH] STATIONS 45s',
                });
            } catch (error) {
                this.logger.error({
                    method: '_loadAutomaticTimers',
                    message: 'Error in station refresh timer',
                    error,
                });
            }
        }, 45 * 1000);

        // update stations playlist once a day
        const playlistInterval = setInterval(
            async () => {
                try {
                    await this.triggerUpdatePlaylistContentForAllStations();

                    this.logger.info({
                        message: '[AUTO REFRESH] station playlist - once every 24 hours',
                    });
                } catch (error) {
                    this.logger.error({
                        method: '_loadAutomaticTimers',
                        message: 'Error in playlist update timer',
                        error,
                    });
                }
            },
            24 * 60 * 60 * 1000,
        );

        // update charts once a day
        const chartsInterval = setInterval(
            async () => {
                try {
                    await this.triggerRefreshChartAll();

                    this.logger.info({
                        message: '[AUTO REFRESH] CHARTS - once every 24 hours',
                    });
                } catch (error) {
                    this.logger.error({
                        method: '_loadAutomaticTimers',
                        message: 'Error in charts refresh timer',
                        error,
                    });
                }
            },
            24 * 60 * 60 * 1000,
        );

        // Store intervals for cleanup
        this.intervals = [stationInterval, playlistInterval, chartsInterval];

        // Shorten all playlists to 220 rows
        /* currently disabled, no need at this point.
        setInterval(() => {
            this.triggerSliceAllPlaylist();

            this.logger.info({
                message: '[AUTO REFRESH] SHORTEN ALL PLAYLISTS, every 4 hours',
            });
        }, 4 * 60 * 60 * 1000);
        */

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
