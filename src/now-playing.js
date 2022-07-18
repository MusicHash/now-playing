import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import express from 'express';
import prettier from 'prettier';

import logger from './utils/logger.js';
import { terminate } from './utils/terminate.js';

import { refreshAllStations, refreshChart, refreshChartAll, getChartInfo } from './lib/fetch_sources.js';
import { stations, charts } from '../config/sources.js';

import { slicePlaylist, sliceAllPlaylists } from './lib/playlist.js';

import Spotify from './lib/providers/spotify.js';


Spotify.connect().then(() => {
    logger.info({
        message: 'Spotify initialized successfully'
    });
})

const triggerRefreshAllStations = async function () {
    try {
        let res = await refreshAllStations();

        logger.info({method: 'triggerRefreshAllStations', message: res});
    } catch(err) {
        logger.error({
            method: 'triggerRefreshAllStations',
            error: 'Could not refresh stations',
            message: err,
        });
    }
};


const triggerRefreshChartAll = async function () {
    try {
        let res = await refreshChartAll();

        logger.info({method: 'triggerRefreshChartAll', message: res});
    } catch(err) {
        logger.error({
            method: 'triggerRefreshChartAll',
            error: 'Could not refresh charts',
            message: err,
        });
    }
};

const triggerRefreshChart = async function (chart) {
    try {
        let res = await refreshChart(chart);

        logger.info({method: 'triggerRefreshChart', chart, message: res});
    } catch(err) {
        logger.error({
            method: 'triggerRefreshChart',
            chart,
            error: 'Could not refresh chart',
            message: err,
        });
    }
};

const triggerSliceAllPlaylist = async function (chart) {
    try {
        let res = await sliceAllPlaylists();

        logger.info({method: 'triggerSliceAllPlaylist', chart, message: res});
    } catch(err) {
        logger.error({
            method: 'triggerSliceAllPlaylist',
            chart,
            error: 'Could not slice chart',
            message: err,
        });
    }
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
        '/debug_channels': 'Debug Channels',
    };

    let html = Object.keys(links).map(function (result, item) {
        return `<li><a href="${result}">${links[result]}</a></li>`;
    }, 0).join("\r\n");

    res.send(`<ul>${html}</ul>`);
});

app.get('/debug_channels', async (req, res) => {
    let output = [];
    let items = Object.assign({}, stations, charts);

    for (let stationIdx in items) {
        output.push(`<li><a href="/debug_channels/${stationIdx}">${stationIdx}</a></li>`);
    }

    res.send(`<ul>${output.join("\n")}</ul>`);
});

app.get('/debug_channels/:chartID', async (req, res) => {
    let chartID = req.params.chartID;
    let output = [];

    try {
        
        let items = Object.assign({}, stations, charts);
        let props = items[chartID];
        let rawURL = new Buffer(props.scraper.url, 'base64').toString('ascii'); // decode

        let formattedStationParserInfo = prettier.format(JSON.stringify(props), { semi: false, parser: 'json' });
        output.push(`formattedStationParserInfo: ${chartID}`);
        output.push(`URL: ${rawURL}`);
        output.push(formattedStationParserInfo);

        let chartRPC = await getChartInfo(props);
        let formattedRPCInfo = prettier.format(JSON.stringify(chartRPC), { semi: false, parser: 'json' });

        output.push(`chartRPC: ${chartID}`);
        output.push(formattedRPCInfo);
    } catch(err) {
        output.push(`Error: ${chartID}`);
        output.push(err);
    }

    res.send(`<pre>${output.join("\n")}</pre>`);
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
