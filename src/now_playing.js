import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import express from 'express';
import prettier from 'prettier';

import logger from './utils/logger.js';
import redisWrapper from './utils/redis_wrapper.js';
import { terminate } from './utils/terminate.js';

import { refreshAllStations, refreshChart, refreshChartAll, getChartInfo } from './lib/fetch_sources.js';
import { stations, charts } from '../config/sources.js';

import { slicePlaylist, sliceAllPlaylists } from './lib/playlist.js';

import Spotify from './lib/providers/spotify.js';

/**
 * NowPlaying
 */
class NowPlaying {
    logger;
    app;
    server;

    constructor(Logger) {
        this.logger = Logger;
        this.app = express();
        const server = this._getExpressServer(this.app);
        this._terminateHandle(server);

        // init
        this._loadRoutes();
        this._spotifyConnect();
        this._loadAutomaticTimers();

        const connect = this._connectToRedis();

        return this;
    }

    async _connectToRedis() {
        const redisURL = process.env.REDIS_URL;

        if (redisURL) {
            this.logger.info('Connecting to Redis...');

            await redisWrapper.init(this.logger, redisURL).connect();

            this.logger.info('Connected to Redis!');
        } else {
            this.logger.warn('REDIS_URL is not defined, redis will not be connected');
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
        const exitHandler = terminate(server, {
            coredump: false,
        });

        // Start reading from stdin so we don't exit.
        process.stdin.resume();

        process
            .on('unhandledRejection', (reason, p) => {
                this.logger.error(reason, 'Unhandled Rejection at Promise', p);
            })
            .on('uncaughtException', (err) => {
                this.logger.error(err, 'Uncaught Exception thrown');
                process.exit(1);
            });

        ['SIGTERM', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGHUP', 'uncaughtException', 'unhandledRejection'].forEach((eventType) => {
            process.on(eventType, exitHandler.bind(null, eventType));
        });

        return this;
    }

    async triggerRefreshAllStations() {
        try {
            let res = await refreshAllStations();

            this.logger.info({
                method: 'triggerRefreshAllStations',
                message: res,
            });
        } catch (error) {
            this.logger.error({
                method: 'triggerRefreshAllStations',
                message: 'Could not refresh stations',
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

    async triggerRefreshChart(chart) {
        try {
            let res = await refreshChart(chart);

            this.logger.info({
                method: 'triggerRefreshChart',
                message: res,
                args: [...arguments],
            });
        } catch (error) {
            this.logger.error({
                method: 'triggerRefreshChart',
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
            res.redirect(Spotify.createAuthorizeURL());
        });

        this.app.get('/spotify/auth/redirect', async (req, res) => {
            const error = req.query.error;
            const code = req.query.code;

            Spotify.auth(code, error, res);
        });

        this.app.get('/actions', async (req, res) => {
            let links = {
                '/spotify/login': 'Re-Login',
                '/refresh_playlists_manually': 'Refresh Stations (all)',
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
                let rawURL = new Buffer(props.scraper.url, 'base64').toString('ascii'); // decode

                let formattedStationParserInfo = await prettier.format(JSON.stringify(props), { semi: false, parser: 'json' });
                output.push(`formattedStationParserInfo: ${chartID}`);
                output.push(`URL: ${rawURL}`);
                output.push(formattedStationParserInfo);

                let chartRPC = await getChartInfo(props);
                let formattedRPCInfo = await prettier.format(JSON.stringify(chartRPC), { semi: false, parser: 'json' });

                output.push(`chartRPC: ${chartID}`);
                output.push(formattedRPCInfo);
            } catch (error) {
                output.push(`Error: ${chartID}`);
                output.push(error);
            }
                
            res.send(`<pre>${output.join('\n')}</pre>`);
        });

        this.app.get('/refresh_playlists_manually', async (req, res) => {
            this.triggerRefreshAllStations();
            res.send('Success, triggerRefreshAllStations!');
        });

        this.app.get('/refresh_charts_manually/:chart', async (req, res) => {
            let chart = req.params.chart;

            this.triggerRefreshChart(chart);
            res.send(['Success, triggerRefreshChart!', chart]);
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
        // now playing, stations songs
        setInterval(() => {
            this.triggerRefreshAllStations();

            this.logger.info({
                message: '[AUTO REFRESH] STATIONS 45s',
            });
        }, 45 * 1000);

        // update charts once a day
        setInterval(() => {
            this.triggerRefreshChartAll();

            this.logger.info({
                message: '[AUTO REFRESH] CHARTS - once every 24 hours',
            });
        }, 24 * 60 * 60 * 1000);

        // Shorten all playlists to 220 rows
        setInterval(() => {
            this.triggerSliceAllPlaylist();

            this.logger.info({
                message: '[AUTO REFRESH] SHORTEN ALL PLAYLISTS, every 4 hours',
            });
        }, 4 * 60 * 60 * 1000);

        return this;
    }

    _spotifyConnect() {
        Spotify.connect().then(() => {
            this.logger.info({
                message: 'Spotify initialized successfully',
            });
        });

        return this;
    }
}

export default new NowPlaying(logger);
