import { Router } from 'express';

import { refreshChartAll } from '../lib/fetch_sources.js';
import { slicePlaylist, sliceAllPlaylists } from '../lib/playlist.js';

export default function playlistRoutes(logger) {
    const router = Router();

    router.get('/playlist/refresh_charts/all', async (req, res) => {
        triggerRefreshChartAll(logger);
        res.send(['Success, Queued ALL charts for refresh. (triggerRefreshChartAll)']);
    });

    router.get('/playlist/slice/:playlist/:limit', async (req, res) => {
        let playlist = req.params.playlist;
        let limit = req.params.limit;

        await slicePlaylist(playlist, limit);
        res.send(['Success, slicePlaylist!', playlist, limit]);
    });

    router.get('/playlist/slice/all', async (req, res) => {
        triggerSliceAllPlaylist(logger);
        res.send(['Success, Queued ALL playlists for slice. (sliceAllPlaylist)']);
    });

    return router;
}

async function triggerRefreshChartAll(logger) {
    try {
        let res = await refreshChartAll();

        logger.info({
            method: 'triggerRefreshChartAll',
            message: res,
        });
    } catch (error) {
        logger.error({
            method: 'triggerRefreshChartAll',
            message: 'Could not refresh charts',
            error,
        });
    }
}

async function triggerSliceAllPlaylist(logger) {
    try {
        let res = await sliceAllPlaylists();

        logger.info({
            method: 'triggerSliceAllPlaylist',
            message: res,
        });
    } catch (error) {
        logger.error({
            method: 'triggerSliceAllPlaylist',
            message: 'Could not slice chart',
            error,
        });
    }
}
