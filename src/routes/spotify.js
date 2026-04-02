import { Router } from 'express';

import Spotify from '../lib/providers/spotify.js';

export default function spotifyRoutes(logger) {
    const router = Router();

    router.get('/spotify/login', async (req, res) => {
        res.redirect(await Spotify.createAuthorizeURL());
    });

    router.get('/spotify/auth/redirect', async (req, res) => {
        const error = req.query.error;
        const code = req.query.code;

        Spotify.auth(code, error, res);
    });

    return router;
}
