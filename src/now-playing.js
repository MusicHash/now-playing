const express = require('express');

const { refreshAllStations, refreshAllCharts } = require('./lib/fetch_sources');
require('dotenv').config();
const Spotify = require('./lib/providers/spotify');

Spotify.connect().then(() => {
    console.log('Spotify inited');
})

const triggerRefreshAllStations = function() {
    let scan = refreshAllStations().then(body => console.log(body));
};

const triggerRefreshAllCharts = function () {
    let scan = refreshAllCharts().then(body => console.log(body));
};

const app = express();

app.get('/spotify/login', (req, res) => {
    res.redirect(Spotify.createAuthorizeURL());
});

app.get('/spotify/auth/redirect', (req, res) => {
    const error = req.query.error;
    const code = req.query.code;

    Spotify.auth(code, error, res);
});

app.get('/refresh_playlists_manually', (req, res) => {
    triggerRefreshAllStations();
    res.send('Success, triggerRefreshAllStations!');
});

app.get('/refresh_charts_manually', (req, res) => {
    triggerRefreshAllCharts();
    res.send('Success, triggerRefreshAllCharts!');
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
