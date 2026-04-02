import { Router } from 'express';

import healthRoutes from './health.js';
import spotifyRoutes from './spotify.js';
import stationRoutes from './stations.js';
import playlistRoutes from './playlists.js';
import debugRoutes from './debug.js';
import dataRoutes from './data.js';

export default function createRoutes(logger) {
    const router = Router();

    router.use(healthRoutes());
    router.use(spotifyRoutes(logger));
    router.use(stationRoutes(logger));
    router.use(playlistRoutes(logger));
    router.use(debugRoutes(logger));
    router.use(dataRoutes(logger));

    return router;
}
