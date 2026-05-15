import {
    crawlAllStationsToNotifyTrackChanges,
    crawlHistoryChartsToNotifyTrackChanges,
    updatePlaylistContentForAllStations,
    collectChartDataAll,
    syncAllChartsToSpotify,
} from './lib/fetch_sources.js';
import { sliceAllPlaylists } from './lib/playlist.js';

class Scheduler {
    logger;
    intervals = [];

    constructor(logger) {
        this.logger = logger;
    }

    start() {
        const stationInterval = setInterval(async () => {
            try {
                await crawlAllStationsToNotifyTrackChanges();

                this.logger.info({
                    method: 'Scheduler.crawlStations',
                    message: 'Station crawl tick finished',
                    metadata: { intervalSeconds: 45 },
                });
            } catch (error) {
                this.logger.error({
                    method: 'Scheduler.crawlStations',
                    message: 'Error in station refresh timer',
                    error,
                });
            }
        }, 45 * 1000);

        const historyChartsInterval = setInterval(
            async () => {
                try {
                    await crawlHistoryChartsToNotifyTrackChanges();

                    this.logger.info({
                        method: 'Scheduler.crawlHistoryCharts',
                        message: 'History chart crawl tick finished',
                        metadata: { intervalMinutes: 5 },
                    });
                } catch (error) {
                    this.logger.error({
                        method: 'Scheduler.crawlHistoryCharts',
                        message: 'Error in history charts refresh timer',
                        error,
                    });
                }
            },
            5 * 60 * 1000,
        );

        const playlistInterval = setInterval(
            async () => {
                try {
                    await updatePlaylistContentForAllStations();

                    this.logger.info({
                        method: 'Scheduler.updatePlaylists',
                        message: 'Playlist update jobs queued',
                        metadata: { intervalHours: 24 },
                    });
                } catch (error) {
                    this.logger.error({
                        method: 'Scheduler.updatePlaylists',
                        message: 'Error in playlist update timer',
                        error,
                    });
                }
            },
            24 * 60 * 60 * 1000,
        );

        const chartCollectInterval = setInterval(
            async () => {
                try {
                    await collectChartDataAll();

                    this.logger.info({
                        method: 'Scheduler.collectChartData',
                        message: 'Chart collection jobs queued',
                        metadata: { intervalHours: 24 },
                    });
                } catch (error) {
                    this.logger.error({
                        method: 'Scheduler.collectChartData',
                        message: 'Error in chart collection timer',
                        error,
                    });
                }
            },
            24 * 60 * 60 * 1000,
        );

        const chartSyncInterval = setInterval(
            async () => {
                try {
                    await syncAllChartsToSpotify();

                    this.logger.info({
                        method: 'Scheduler.syncChartsToSpotify',
                        message: 'Chart Spotify sync jobs queued',
                        metadata: { intervalHours: 24 },
                    });
                } catch (error) {
                    this.logger.error({
                        method: 'Scheduler.syncChartsToSpotify',
                        message: 'Error in chart Spotify sync timer',
                        error,
                    });
                }
            },
            24 * 60 * 60 * 1000,
        );

        this.intervals = [
            stationInterval,
            historyChartsInterval,
            playlistInterval,
            chartCollectInterval,
            chartSyncInterval,
        ];

        // Shorten all playlists to 220 rows
        /* currently disabled, no need at this point.
        const sliceInterval = setInterval(() => {
            sliceAllPlaylists().catch(error => {
                this.logger.error({
                    method: 'Scheduler.slicePlaylists',
                    message: 'Error slicing playlists',
                    error,
                });
            });

            this.logger.info({
                message: '[AUTO REFRESH] SHORTEN ALL PLAYLISTS, every 4 hours',
            });
        }, 4 * 60 * 60 * 1000);
        */

        this.logger.info({
            method: 'Scheduler.start',
            message: 'Scheduler started',
        });

        return this;
    }

    stop() {
        this.intervals.forEach((interval) => {
            if (interval) clearInterval(interval);
        });

        this.intervals = [];
        this.logger.info({
            method: 'Scheduler.stop',
            message: 'Scheduler stopped',
        });
    }
}

export default Scheduler;
