import { crawlAllStationsToNotifyTrackChanges, updatePlaylistContentForAllStations, collectChartDataAll, syncAllChartsToSpotify } from './lib/fetch_sources.js';
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
                let res = await crawlAllStationsToNotifyTrackChanges();

                this.logger.info({
                    method: 'Scheduler.crawlStations',
                    message: res,
                });

                this.logger.info({
                    message: '[AUTO REFRESH] STATIONS 45s',
                });
            } catch (error) {
                this.logger.error({
                    method: 'Scheduler.crawlStations',
                    message: 'Error in station refresh timer',
                    error,
                });
            }
        }, 45 * 1000);

        const playlistInterval = setInterval(
            async () => {
                try {
                    let res = await updatePlaylistContentForAllStations();

                    this.logger.info({
                        method: 'Scheduler.updatePlaylists',
                        message: res,
                    });

                    this.logger.info({
                        message: '[AUTO REFRESH] station playlist - once every 24 hours',
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
                    let res = await collectChartDataAll();

                    this.logger.info({
                        method: 'Scheduler.collectChartData',
                        message: res,
                    });

                    this.logger.info({
                        message: '[AUTO REFRESH] CHART COLLECTION - once every 24 hours (skips if week exists)',
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
                    let res = await syncAllChartsToSpotify();

                    this.logger.info({
                        method: 'Scheduler.syncChartsToSpotify',
                        message: res,
                    });

                    this.logger.info({
                        message: '[AUTO REFRESH] CHART SPOTIFY SYNC - once every 24 hours',
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

        this.intervals = [stationInterval, playlistInterval, chartCollectInterval, chartSyncInterval];

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

        this.logger.info({ message: 'Scheduler started' });

        return this;
    }

    stop() {
        this.intervals.forEach((interval) => {
            if (interval) clearInterval(interval);
        });

        this.intervals = [];
        this.logger.info({ message: 'Scheduler stopped' });
    }
}

export default Scheduler;
