import { getCurrentTracks } from './tracks.js';
import { updatePlayList, replacePlayList, _getPlaylistID, updatePlaylistMetadata } from './playlist.js';

import { stations, charts } from '../../config/sources.js';

import logger from '../utils/logger.js';
import { SYSTEM_EVENTS } from '../constants/events.js';
import { DURATION } from '../constants/numbers.js';
import { hash } from '../utils/crypt.js';
import redisWrapper from '../utils/redis_wrapper.js';
import eventEmitterWrapper from '../utils/event_emitter_wrapper.js';
import { getMostPlayedSongsByStation } from './query_log/most_played_songs.js';
import { getYearWeek, doesChartWeekExist, insertChartEntries, getLatestChartEntries } from './query_log/chart_log.js';
import Spotify from './providers/spotify.js';
import MySQLWrapper from '../utils/mysql_wrapper.js';
import { cleanNames } from '../utils/strings.js';

const didSourceChange = async function (station, response) {
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

const getChartInfo = async function (chartID, props) {
    const chartInfo = await getCurrentTracks({
        ID: chartID,
        scraperProps: props.scraper,
        parserProps: props.parser,
    });

    return chartInfo;
};

const crawlAllStationsToNotifyTrackChanges = async function () {
    for (let station in stations) {
        let props = stations[station];

        try {
            const tracks = await getCurrentTracks({
                ID: station,
                scraperProps: props.scraper,
                parserProps: props.parser,
            });

            const payload = {
                station: station,
                result: tracks,
            };

            const shouldSendUpdate = await didSourceChange(station, payload);

            if (shouldSendUpdate && payload?.result?.total > 0) {
                await eventEmitterWrapper.emit(SYSTEM_EVENTS.ON_STATION_TRACK_UPDATED, payload);
            }
        } catch (error) {
            logger.error({
                method: 'getCurrentTracks -> crawlAllStationsToNotifyTrackChanges',
                message: 'Failed to refresh station',
                error,
                metadata: {
                    station,
                },
            });
        }
    }
};

const updatePlaylistContentForStationLocal = async function (stationKey) {
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
    } catch (error) {
        logger.error({
            method: 'updatePlaylistContentForStationLocal',
            message: 'Failed to update a station',
            error: error instanceof Error ? error.message : JSON.stringify(error, null, 2),
            metadata: {
                stationKey,
                station,
                args: [...arguments],
            },
        });
    }
};

const _resolveSpotifyId = async function (artist, title) {
    const query = cleanNames([artist, title].join(' '));

    if (query.length <= 3) {
        return null;
    }

    try {
        const search = await Spotify.searchTracksWithCache(query);
        const track = search?.tracks?.items[0];

        if (!track?.id) {
            return null;
        }

        const spotifyId = await MySQLWrapper.checkAndInsert(
            'nowplaying_spotify_tracks',
            'spotify_id',
            { spotify_track_id: track.id },
            {
                spotify_track_id: track.id,
                spotify_artist_id: track?.artists[0]?.id || '',
                spotify_artist_title: track?.artists[0]?.name || '',
                spotify_track_title: track.name,
                spotify_duration_ms: track.duration_ms,
                spotify_popularity: track.popularity,
                spotify_timestamp_added: Math.floor(Date.now() / 1000),
            },
        );

        return spotifyId;
    } catch (error) {
        logger.warn({
            method: '_resolveSpotifyId',
            message: `Spotify resolution failed for "${query}", storing entry without link`,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
};

const collectChartData = async function (chartKey) {
    let chart = charts[chartKey];

    if (!chart) {
        logger.error({
            method: 'collectChartData',
            message: 'Chart not found',
            metadata: { chartKey },
        });
        return;
    }

    const yearWeek = getYearWeek();

    try {
        const exists = await doesChartWeekExist(chartKey, yearWeek);

        if (exists) {
            logger.info({
                method: 'collectChartData',
                message: `Chart ${chartKey} already collected for week ${yearWeek}, skipping`,
            });
            return;
        }

        const tracks = await getCurrentTracks({
            ID: chartKey,
            scraperProps: chart.scraper,
            parserProps: chart.parser,
        });

        if (!tracks?.fields?.length) {
            logger.warn({
                method: 'collectChartData',
                message: `No tracks returned for chart ${chartKey}, skipping insert`,
            });
            return;
        }

        const enrichedFields = [];
        for (const field of tracks.fields) {
            const spotifyId = await _resolveSpotifyId(field.artist || '', field.title || '');
            enrichedFields.push({ ...field, spotifyId });
        }

        await insertChartEntries(chartKey, yearWeek, enrichedFields);
    } catch (error) {
        logger.error({
            method: 'collectChartData',
            message: 'Failed to collect chart data',
            error: error instanceof Error ? error.message : JSON.stringify(error, null, 2),
            metadata: { chartKey, yearWeek },
        });
    }
};

const collectChartDataAll = async function () {
    let delaySeconds = 60,
        chartEnumeration = 0;

    for (let chartKey in charts) {
        let delayBySeconds = delaySeconds * chartEnumeration;

        setTimeout(() => {
            collectChartData(chartKey);
        }, delayBySeconds * 1000);

        logger.info({
            method: 'collectChartDataAll',
            message: `Queued chart ${chartKey} for collection in ${delayBySeconds}s`,
        });

        chartEnumeration++;
    }
};

const syncChartToSpotify = async function (chartKey) {
    let chart = charts[chartKey];

    if (!chart) {
        logger.error({
            method: 'syncChartToSpotify',
            message: 'Chart not found',
            metadata: { chartKey },
        });
        return;
    }

    try {
        const entries = await getLatestChartEntries(chartKey);

        if (!entries || entries.length === 0) {
            logger.warn({
                method: 'syncChartToSpotify',
                message: `No chart entries in DB for ${chartKey}, skipping Spotify sync`,
            });
            return;
        }

        const trackURIs = entries
            .filter((e) => e.spotify_track_id)
            .map((e) => `spotify:track:${e.spotify_track_id}`);

        if (trackURIs.length === 0) {
            logger.warn({
                method: 'syncChartToSpotify',
                message: `No Spotify-linked entries for ${chartKey}, skipping sync`,
            });
            return;
        }

        const playlistID = _getPlaylistID(chartKey);
        await Spotify.replaceTracksInPlaylist(playlistID, trackURIs);
        await updatePlaylistMetadata(chartKey);

        logger.info({
            method: 'syncChartToSpotify',
            message: `Synced ${trackURIs.length} tracks to Spotify for ${chartKey} (week ${entries[0].chart_year_week})`,
        });
    } catch (error) {
        logger.error({
            method: 'syncChartToSpotify',
            message: 'Failed to sync chart to Spotify',
            error: error instanceof Error ? error.message : JSON.stringify(error, null, 2),
            metadata: { chartKey },
        });
    }
};

const syncAllChartsToSpotify = async function () {
    let delaySeconds = 60,
        chartEnumeration = 0;

    for (let chartKey in charts) {
        let delayBySeconds = delaySeconds * chartEnumeration;

        setTimeout(() => {
            syncChartToSpotify(chartKey);
        }, delayBySeconds * 1000);

        logger.info({
            method: 'syncAllChartsToSpotify',
            message: `Queued chart ${chartKey} for Spotify sync in ${delayBySeconds}s`,
        });

        chartEnumeration++;
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

    try {
        const tracks = await getCurrentTracks({
            ID: chartKey,
            scraperProps: chart.scraper,
            parserProps: chart.parser,
        });

        await replacePlayList(chartKey, tracks);
    } catch (error) {
        logger.error({
            method: 'refreshChartRemote',
            message: 'Failed to refresh a chart',
            error: error instanceof Error ? error.message : JSON.stringify(error, null, 2),
            metadata: {
                chart,
                args: [...arguments],
            },
        });
    }
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

const updatePlaylistContentForAllStations = async function () {
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

export {
    crawlAllStationsToNotifyTrackChanges,
    refreshChartRemote,
    updatePlaylistContentForAllStations,
    refreshChartAll,
    getChartInfo,
    collectChartData,
    collectChartDataAll,
    syncChartToSpotify,
    syncAllChartsToSpotify,
};
