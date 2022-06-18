import http from 'http';
import express from 'express';

import logger from './utils/logger.js';
import { terminate } from './utils/terminate.js';

import { refreshAllStations, refreshChart, refreshChartAll } from './lib/fetch_sources.js';
import { slicePlaylist, sliceAllPlaylists } from './lib/playlist.js';

import Spotify from './lib/providers/spotify.js';

import dotenv from 'dotenv';
dotenv.config();


Spotify.connect().then(() => {
    logger.info({message: 'Spotify initialized successfully'});
})

const triggerRefreshAllStations = function () {
    let res = refreshAllStations().then(body => logger.info({method: 'triggerRefreshAllStations', message: body}));
};

const triggerRefreshChartAll = function () {
    let res = refreshChartAll().then(body => logger.info({method: 'triggerRefreshChartAll', message: body}));
};

const triggerRefreshChart = function (chart) {
    let res = refreshChart(chart).then(body => logger.info({method: 'triggerRefreshChart', chart, message: body}));
};

const triggerSliceAllPlaylist = function (chart) {
    let res = sliceAllPlaylists().then(body => logger.info({method: 'triggerSliceAllPlaylist', chart, message: body}));
};

const app = express();

app.get('/spotify/login', async (req, res) => {
    res.redirect(Spotify.createAuthorizeURL());
});

app.get('/spotify/auth/redirect', async (req, res) => {
    const error = req.query.error;
    const code = req.query.code;

    Spotify.auth(code, error, res);
});

app.get('/actions', async (req, res) => {
    let links = {
        '/spotify/login': 'Re-Login',
        '/refresh_playlists_manually': 'Refresh Stations (all)',
        '/playlist/refresh_charts/all': 'Refresh Charts - in batches (all)',
        '/playlist/slice/all': 'Shorten the playlist to limit (all)',
    };

    let html = Object.keys(links).map(function (result, item) {
        return `<li><a href="${result}">${links[result]}</a></li>`;
    }, 0).join("\r\n");

    res.send(`<ul>${html}</ul>`);
});

app.get('/refresh_playlists_manually', async (req, res) => {
    triggerRefreshAllStations();
    res.send('Success, triggerRefreshAllStations!');
});

app.get('/refresh_charts_manually/:chart', async (req, res) => {
    let chart = req.params.chart;
    
    triggerRefreshChart(chart);
    res.send(['Success, triggerRefreshChart!', chart]);
});

app.get('/playlist/refresh_charts/all', async (req, res) => {
    triggerRefreshChartAll();
    res.send(['Success, Queued ALL charts for refresh. (triggerRefreshChartAll)']);
});

app.get('/playlist/slice/:playlist/:limit', async (req, res) => {
    let playlist = req.params.playlist;
    let limit = req.params.limit;

    await slicePlaylist(playlist, limit);
    res.send(['Success, slicePlaylist!', playlist, limit]);
});

app.get('/playlist/slice/all', async (req, res) => {
    triggerSliceAllPlaylist();
    res.send(['Success, Queued ALL playlists for slice. (sliceAllPlaylist)']);
});

const server = http
    .createServer(app)
    .listen(process.env.EXPRESS_PORT, () =>
        logger.info({
            message: `HTTP Server up. Now go to http://localhost:${process.env.EXPRESS_PORT}/login in your browser`
        })
    )
    .on('close', () => logger.info({message: 'Closed HTTP Server!'}));

// Handle exit process
const exitHandler = terminate(server, {
    coredump: false,
});

// Start reading from stdin so we don't exit.
process.stdin.resume();

['SIGTERM', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGHUP', 'uncaughtException', 'unhandledRejection'].forEach((eventType) => {
    process.on(eventType, exitHandler.bind(null, eventType));
});


// triggers

// now playing, stations songs
setInterval(() => {
    triggerRefreshAllStations();

    logger.info({message: '[AUTO REFRESH] STATIONS 45s'});
}, 45 * 1000);


// update charts once a day
setInterval(() => {
    triggerRefreshChartAll();

    logger.info({message: '[AUTO REFRESH] CHARTS - once every 24 hours'});
}, 24 * 60 * 60 * 1000);


// Shorten all playlists to 220 rows
setInterval(() => {
    triggerSliceAllPlaylist();

    logger.info({message: '[AUTO REFRESH] SHORTEN ALL PLAYLISTS, every 4 hours'});
}, 4 * 60 * 60 * 1000);
