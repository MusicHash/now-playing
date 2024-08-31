import { getCurrentTracks } from './tracks.js';
import { updatePlayList, replacePlayList, _getPlaylistID } from './playlist.js';

import { stations, charts } from '../../config/sources.js';

import logger from '../utils/logger.js';
import { SYSTEM_EVENTS } from '../constants/events.js';
import { DURATION } from '../constants/numbers.js';
import { hash } from '../utils/crypt.js';
import redisWrapper from '../utils/redis_wrapper.js';
import eventEmitterWrapper from '../utils/event_emitter_wrapper.js';
import { getMostPlayedSongsByStation } from './query_log/most_played_songs.js';


const didSourceChange = async function(station, response) {
    const hashKey = 'NOWPLAYNG:SORUCES:RECENT_CHANGE_BY_SOURCE';
    const hashField = station;
    const lastStationResponse = JSON.parse(await redisWrapper.getHash(hashKey, hashField));

    response = JSON.stringify(response);

    if (hash(lastStationResponse) !== hash(response)) {
        await redisWrapper.addHash(hashKey, hashField, response, DURATION.OF_1_HOUR);

        return true;
    }

    return false;
};

const getChartInfo = async function (props) {
    const chartInfo = await getCurrentTracks({
        scraperProps: props.scraper,
        parserProps: props.parser,
    });

    return chartInfo;
};

const crawlAllStationsToNotifyTrackChanges = async function () {
    for (let station in stations) {
        let props = stations[station];

        getCurrentTracks({
            scraperProps: props.scraper,
            parserProps: props.parser,
        })
            .then(async (tracks) => {
                const payload = {
                    station: station,
                    result: tracks,
                };

                const shouldSendUpdate = await didSourceChange(station, payload);

                if (shouldSendUpdate && payload?.result?.total > 0) {
                    await eventEmitterWrapper.emit(SYSTEM_EVENTS.ON_STATION_TRACK_UPDATED, payload);
                }

            })
            .catch((error) =>
                logger.error({
                    method: 'getCurrentTracks -> crawlAllStationsToNotifyTrackChanges',
                    message: 'Failed to refresh station',
                    error,
                    metadata: {
                        station,
                    },
                }),
            );
    }
};

const updatePlaylistContentForStationLocal = async function(stationKey) {
    let station = stations[stationKey];

    if (!station) {
        logger.error({
            method: 'updatePlaylistContentForStationLocal',
            message: 'Station not found',
            metadata: {
                stationKey,
                args: [...arguments],
            },
        });

        return Promise.reject();
    }

    logger.debug({
        method: 'updatePlaylistContentForStationLocal',
        error: 'Starting station update for a single station',
        metadata: {
            stationKey,
            station,
            args: [...arguments],
        },
    });


    try {
        const mostPlayedSongsByStation = await getMostPlayedSongsByStation(stationKey, 30, 100);

        const payload = {
            stationKey: stationKey,
            spotifyPlaylistID: _getPlaylistID(stationKey),
            spotifyTracksList: mostPlayedSongsByStation,
        };

        await eventEmitterWrapper.emit(SYSTEM_EVENTS.ON_SPOTIFY_PLAYLIST_UPDATE, payload);
    } catch(error) {
            logger.error({
                method: 'updatePlaylistContentForStationLocal',
                message: 'Failed to update a station',
                error,
                metadata: {
                    stationKey,
                    station,
                    args: [...arguments],
                },
            });
    }

};

const refreshChartLocal = async function(chartKey) {
    let chart = charts[chartKey];

    if (!chart) {
        logger.error({
            method: 'refreshChartLocal',
            message: 'Chart not found',
            metadata: {
                chart,
                args: [...arguments],
            },
        });

        return Promise.reject();
    }

    logger.debug({
        method: 'refreshChartLocal',
        error: 'Starting chart refreshing for a single chart',
        metadata: {
            chart,
            args: [...arguments],
        },
    });


    try {
        // const mostPlayedSongsByStation = await getMostPlayedSongsByStation(chartKey, 30);
        // console.log('BLA');
        // console.log(mostPlayedSongsByStation);
    } catch(error) {
            logger.error({
                method: 'refreshChartLocal',
                message: 'Failed to refresh a chart',
                error,
                metadata: {
                    chart,
                    args: [...arguments],
                },
            });
    }

};

const refreshChartRemote = async function (chartKey) {
    let chart = charts[chartKey];

    if (!chart) {
        logger.error({
            method: 'refreshChartRemote',
            message: 'Chart not found',
            metadata: {
                chart,
                args: [...arguments],
            },
        });

        return Promise.reject();
    }

    logger.debug({
        method: 'refreshChartRemote',
        error: 'Starting chart refreshing for a single chart',
        metadata: {
            chart,
            args: [...arguments],
        },
    });

    
    getCurrentTracks({
        scraperProps: chart.scraper,
        parserProps: chart.parser,
    })
        .then(async (tracks) => {
            await replacePlayList(chartKey, tracks);
        })

        .catch((error) =>
            logger.error({
                method: 'refreshChartRemote',
                message: 'Failed to refresh a chart',
                error,
                metadata: {
                    chart,
                    args: [...arguments],
                },
            }),
        );
};

const refreshChartAll = async function () {
    let delaySeconds = 60,
        chartEnumeration = 0;

    for (let chartKey in charts) {
        let delayBySeconds = delaySeconds * chartEnumeration;

        setTimeout(() => {
            refreshChartRemote(chartKey);
        }, delayBySeconds * 1000);

        logger.info({
            method: 'refreshChartAll',
            message: `Queued chart ${chartKey} for update in ${delayBySeconds}s`,
        });

        chartEnumeration++;
    }
};

const updatePlaylistContentForAllStations = async function() {
    let delaySeconds = 60, // first iteration should instant.
        stationEnumeration = 0;

    for (let stationKey in stations) {
        let delayBySeconds = delaySeconds * stationEnumeration;

        setTimeout(() => {
            updatePlaylistContentForStationLocal(stationKey);
        }, delayBySeconds * 1000);

        logger.info({
            method: 'updatePlaylistContentForAllStations',
            message: `Queued chart ${stationKey} for update in ${delayBySeconds}s`,
        });

        stationEnumeration++;
    }
};

export { crawlAllStationsToNotifyTrackChanges, refreshChartRemote, refreshChartLocal, updatePlaylistContentForAllStations, refreshChartAll, getChartInfo };
