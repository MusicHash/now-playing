import { Router } from 'express';
import express from 'express';
import SpotifyWebApi from 'spotify-web-api-node';

const SCOPES = ['user-read-playback-state', 'user-modify-playback-state'];
const STATE_KEY = 'player-auth';

export default function playerRoutes(logger) {
    const router = Router();

    const api = new SpotifyWebApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIFY_PLAYER_CALLBACK_ENDPOINT,
    });

    router.get('/player/login', (_req, res) => {
        const url = api.createAuthorizeURL(SCOPES, STATE_KEY);
        res.redirect(url);
    });

    router.get('/player/callback', async (req, res) => {
        const { error, code } = req.query;

        if (error) {
            logger.error({ method: 'player/callback', message: 'Auth error', error });
            res.redirect(`/playlist#playerError=${encodeURIComponent(error)}`);
            return;
        }

        try {
            const grant = await api.authorizationCodeGrant(code);
            const { access_token, refresh_token, expires_in } = grant.body;

            const fragment = [
                `playerAccessToken=${encodeURIComponent(access_token)}`,
                `playerRefreshToken=${encodeURIComponent(refresh_token)}`,
                `playerExpiresIn=${expires_in}`,
            ].join('&');

            res.redirect(`/playlist#${fragment}`);
        } catch (err) {
            logger.error({ method: 'player/callback', message: 'Token exchange failed', error: err });
            res.redirect(`/playlist#playerError=${encodeURIComponent('token_exchange_failed')}`);
        }
    });

    router.post('/player/token/refresh', express.json(), async (req, res) => {
        const { refresh_token } = req.body ?? {};

        if (!refresh_token) {
            res.status(400).json({ error: 'refresh_token is required' });
            return;
        }

        try {
            api.setRefreshToken(refresh_token);
            const result = await api.refreshAccessToken();
            const { access_token, expires_in } = result.body;

            res.json({ access_token, expires_in });
        } catch (err) {
            logger.error({ method: 'player/token/refresh', message: 'Refresh failed', error: err });
            res.status(502).json({ error: 'refresh_failed' });
        }
    });

    return router;
}
