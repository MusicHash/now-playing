const express = require('express');

const { fetchAllSources } = require('./lib/fetch_sources');
require('dotenv').config();
const Spotify = require('./lib/providers/spotify');

Spotify.connect().then(() => {
    console.log('Spotify inited');
})

const refreshSources = function() {
    let scan = fetchAllSources().then(body => console.log(body));
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
    refreshSources();
    res.send('Success!');
});

app.listen(process.env.EXPRESS_PORT, () =>
    console.log(
        `HTTP Server up. Now go to http://localhost:${process.env.EXPRESS_PORT}/login in your browser.`
    )
);


setInterval(() => {
    refreshSources();

    console.log('[AUTO REFRESH] 39s');
}, 39 * 1000);
