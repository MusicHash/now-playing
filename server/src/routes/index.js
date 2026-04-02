import { Router } from 'express';

import spotifyRoutes from './spotify.js';
import stationRoutes from './stations.js';
import playlistRoutes from './playlists.js';
import debugRoutes from './debug.js';

export default function createRoutes(logger) {
    const router = Router();

    router.use(spotifyRoutes(logger));
    router.use(stationRoutes(logger));
    router.use(playlistRoutes(logger));
    router.use(debugRoutes(logger));

    return router;
}
