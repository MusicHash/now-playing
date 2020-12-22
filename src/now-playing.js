const express = require('express');

const { refreshAllStations, refreshChart } = require('./lib/fetch_sources');
const { slicePlaylist } = require('./lib/playlist');

require('dotenv').config();

const Spotify = require('./lib/providers/spotify');

Spotify.connect().then(() => {
    console.log('Spotify inited');
})

const triggerRefreshAllStations = function() {
    let scan = refreshAllStations().then(body => console.log(body));
};

const triggerRefreshChart = function (chart) {
    let scan = refreshChart(chart).then(body => console.log(body));
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

app.get('/refresh_playlists_manually', async (req, res) => {
    triggerRefreshAllStations();
    res.send('Success, triggerRefreshAllStations!');
});

app.get('/refresh_charts_manually/:chart', async (req, res) => {
    let chart = req.params.chart;
    
    triggerRefreshChart(chart);
    res.send(['Success, triggerRefreshAllCharts!', chart]);
});


app.get('/playlist/slice/:playlist/:limit', async (req, res) => {
    let playlist = req.params.playlist;
    let limit = req.params.limit;

    await slicePlaylist(playlist, limit);
    res.send(['Success, slicePlaylist!', playlist, limit]);
});


app.listen(process.env.EXPRESS_PORT, () =>
    console.log(
        `HTTP Server up. Now go to http://localhost:${process.env.EXPRESS_PORT}/login in your browser.`
    )
);


setInterval(() => {
    triggerRefreshAllStations();

    console.log('[AUTO REFRESH] 39s');
}, 39 * 1000);
