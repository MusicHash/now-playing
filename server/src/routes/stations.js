import { Router } from 'express';

import { crawlAllStationsToNotifyTrackChanges, refreshChartRemote, updatePlaylistContentForAllStations } from '../lib/fetch_sources.js';

export default function stationRoutes(logger) {
    const router = Router();

    router.get('/crawl_playlists_manually', async (req, res) => {
        triggerCrawlAllStationsToNotifyTrackChanges(logger);
        res.send('Success, triggerCrawlAllStationsToNotifyTrackChanges!');
    });

    router.get('/update_playlists_manually', async (req, res) => {
        triggerUpdatePlaylistContentForAllStations(logger);
        res.send('Success, triggerUpdatePlaylistContentForAllStations!');
    });

    router.get('/refresh_charts_manually/:chart', async (req, res) => {
        let chart = req.params.chart;

        triggerRefreshChartRemote(logger, chart);
        res.send(['Success, triggerRefreshChartRemote!', chart]);
    });

    return router;
}

async function triggerCrawlAllStationsToNotifyTrackChanges(logger) {
    try {
        let res = await crawlAllStationsToNotifyTrackChanges();

        logger.info({
            method: 'triggerCrawlAllStationsToNotifyTrackChanges',
            message: res,
        });
    } catch (error) {
        logger.error({
            method: 'triggerCrawlAllStationsToNotifyTrackChanges',
            message: 'Could not refresh stations',
            error,
        });
    }
}

async function triggerUpdatePlaylistContentForAllStations(logger) {
    try {
        let res = await updatePlaylistContentForAllStations();

        logger.info({
            method: 'triggerUpdatePlaylistContentForAllStations',
            message: res,
        });
    } catch (error) {
        logger.error({
            method: 'triggerUpdatePlaylistContentForAllStations',
            message: 'Could not update stations playlist',
            error,
        });
    }
}

async function triggerRefreshChartRemote(logger, chart) {
    try {
        let res = await refreshChartRemote(chart);

        logger.info({
            method: 'triggerRefreshChartRemote',
            message: res,
            args: [chart],
        });
    } catch (error) {
        logger.error({
            method: 'triggerRefreshChartRemote',
            message: 'Could not refresh chart',
            error,
            metadata: {
                args: [chart],
            },
        });
    }
}
