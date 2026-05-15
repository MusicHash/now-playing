import { getCurrentTracks } from './tracks.js';
import { updatePlayList, replacePlayList, _getPlaylistID, updatePlaylistMetadata } from './playlist.js';

import { stations, charts, historyCharts } from '../../config/sources.js';

import logger from '../utils/logger.js';
import metricsWrapper from '../utils/metrics_wrapper.js';
import { SYSTEM_EVENTS } from '../constants/events.js';
import {
    getNewlyPlayedSongs,
    normalizeHistoryField,
    extractSpotifyTrackId,
    historySongKey,
} from './history_diff.js';
import { DURATION } from '../constants/numbers.js';
import redisWrapper from '../utils/redis_wrapper.js';
import eventEmitterWrapper from '../utils/event_emitter_wrapper.js';
import { getMostPlayedSongsByStation } from './query_log/most_played_songs.js';
import { getYearWeek, doesChartWeekExist, insertChartEntries, getLatestChartEntries } from './query_log/chart_log.js';
import Spotify from './providers/spotify.js';
import { isrcFromSpotifyTrack } from './spotify_track_isrc.js';
import { releaseDateYmdFromSpotifyTrack } from './spotify_track_release_date.js';
import { resolveCanonicalSpotifyId, spotifyTrackDuplicateCheckParams } from './spotify_track_canonical.js';
import MySQLWrapper from '../utils/mysql_wrapper.js';
import { cleanNames } from '../utils/strings.js';

const HISTORY_SNAPSHOT_KEY = (station) => `NOWPLAYING:HISTORY:PREV_SNAPSHOT:${station}`;

const normalizeHistorySongList = function (fields) {
    if (!Array.isArray(fields)) {
        return [];
    }

    return fields.map((f) => {
        const track_id = extractSpotifyTrackId(f);

        const row = {
            track_id,
            artist: normalizeHistoryField(f?.artist),
            title: normalizeHistoryField(f?.title),
        };

        if (f?.added_at != null) {
            row.added_at = String(f.added_at);
        }
        if (f?.popularity != null && f.popularity !== '') {
            row.popularity = Number(f.popularity);
        }
        if (f?.duration_ms != null && f.duration_ms !== '') {
            row.duration_ms = Number(f.duration_ms);
        }

        return row;
    });
};

const saveHistorySnapshot = async function (station, songs, fetchedAt) {
    const key = HISTORY_SNAPSHOT_KEY(station);
    await redisWrapper.addHash(key, 'data', JSON.stringify(songs));
    await redisWrapper.addHash(key, 'datetime', fetchedAt.toString());
};

const crawlHistoryChartsToNotifyTrackChanges = async function () {
    for (const station of Object.keys(historyCharts)) {
        const props = historyCharts[station];

        try {
            const tracks = await getCurrentTracks({
                stationID: station,
                scraperProps: props.scraper,
                parserProps: props.parser,
            });

            const currentList = normalizeHistorySongList(tracks?.fields);

            if (currentList.length === 0) {
                logger.warn({
                    method: 'crawlHistoryChartsToNotifyTrackChanges',
                    message: 'No history tracks returned, skipping',
                    metadata: { stationID: station },
                });
                continue;
            }

            const hash = await redisWrapper.getAll(HISTORY_SNAPSHOT_KEY(station));
            const fetchedAt = new Date();

            if (!hash?.data) {
                await saveHistorySnapshot(station, currentList, fetchedAt);
                continue;
            }

            let previousList;

            try {
                previousList = JSON.parse(hash.data);
            } catch {
                await saveHistorySnapshot(station, currentList, fetchedAt);
                continue;
            }

            if (!Array.isArray(previousList)) {
                await saveHistorySnapshot(station, currentList, fetchedAt);
                continue;
            }

            if (previousList.length === 0) {
                await saveHistorySnapshot(station, currentList, fetchedAt);
                continue;
            }

            const newSongs = getNewlyPlayedSongs(previousList, currentList);

            for (let i = newSongs.length - 1; i >= 0; i--) {
                await eventEmitterWrapper.emit(SYSTEM_EVENTS.ON_STATION_TRACK_UPDATED, {
                    station,
                    result: { fields: [newSongs[i]], total: 1 },
                });
            }

            if (newSongs.length > 0) {
                metricsWrapper.report('HistoryChartNewTracks', [
                    { key: 'stationID', value: station },
                    { key: 'newTrackCount', value: newSongs.length },
                ]);
            }

            await saveHistorySnapshot(station, currentList, fetchedAt);
        } catch (error) {
                logger.error({
                    method: 'crawlHistoryChartsToNotifyTrackChanges',
                    message: 'Failed to refresh history chart station',
                    error,
                    metadata: { stationID: station },
                });
        }
    }
};

/**
 * Stable now-playing identity for deduping change notifications.
 * Full scrape payloads (especially HTTP JSON) often include timestamps or other
 * volatile keys — hashing the entire response caused false "changes" and duplicate
 * station_log rows when crawls overlapped or vendors jittered metadata.
 */
const currentNowPlayingIdentityKey = function (payload) {
    const first = payload?.result?.fields?.[0];
    return first ? historySongKey(first) : '';
};

const didSourceChange = async function (station, response) {
    const hashKey = 'NOWPLAYNG:SORUCES:RECENT_CHANGE_BY_SOURCE';
    const hashField = station;
    const previousRaw = await redisWrapper.getHash(hashKey, hashField);

    const nextKey = currentNowPlayingIdentityKey(response);

    if ((previousRaw ?? '') !== nextKey) {
        await redisWrapper.addHash(hashKey, hashField, nextKey, DURATION.OF_1_HOUR);

        return true;
    }

    return false;
};

const getChartInfo = async function (chartID, props) {
    const chartInfo = await getCurrentTracks({
        stationID: chartID,
        scraperProps: props.scraper,
        parserProps: props.parser,
    });

    return chartInfo;
};

let crawlAllStationsInFlight = false;

/** Updated while a full station crawl runs — used when overlapping ticks log diagnostics. */
let crawlAllStationsProgress = {
    startedAtMs: null,
    currentStation: null,
};

const crawlAllStationsToNotifyTrackChanges = async function () {
    if (crawlAllStationsInFlight) {
        const startedAt = crawlAllStationsProgress.startedAtMs;
        logger.warn({
            method: 'crawlAllStationsToNotifyTrackChanges',
            message:
                'Skipping overlapping station crawl — previous run still in progress (scheduler is 45s, crawl may be slower)',
            metadata: {
                schedulerIntervalSec: 45,
                runStartedAtMs: startedAt,
                elapsedMsSinceRunStart: startedAt != null ? Date.now() - startedAt : null,
                blockingStationID: crawlAllStationsProgress.currentStation,
            },
        });
        return;
    }

    crawlAllStationsInFlight = true;
    const cycleStart = Date.now();
    crawlAllStationsProgress.startedAtMs = cycleStart;
    crawlAllStationsProgress.currentStation = null;

    let successCount = 0;
    let errorCount = 0;
    let updatedCount = 0;

    try {
        for (let station in stations) {
            crawlAllStationsProgress.currentStation = station;
            let props = stations[station];

            try {
                const tracks = await getCurrentTracks({
                    stationID: station,
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
                    metricsWrapper.increment('StationTrackUpdated', { stationID: station });
                    updatedCount++;
                }

                successCount++;
            } catch (error) {
                logger.error({
                    method: 'crawlAllStationsToNotifyTrackChanges',
                    message: 'Failed to refresh station',
                    error,
                    metadata: {
                        stationID: station,
                    },
                });
                errorCount++;
            }
        }
    } finally {
        metricsWrapper.report('StationCrawlCycle', [
            { key: 'durationMs', value: Date.now() - cycleStart },
            { key: 'totalStations', value: Object.keys(stations).length },
            { key: 'successCount', value: successCount },
            { key: 'errorCount', value: errorCount },
            { key: 'updatedCount', value: updatedCount },
        ]);

        crawlAllStationsInFlight = false;
        crawlAllStationsProgress.startedAtMs = null;
        crawlAllStationsProgress.currentStation = null;
    }
};

const updatePlaylistContentForStationLocal = async function (stationKey) {
    let station = stations[stationKey];

    if (!station) {
        logger.error({
            method: 'updatePlaylistContentForStationLocal',
            message: 'Station not found',
            metadata: {
                stationID: stationKey,
            },
        });

        return Promise.reject();
    }

    logger.debug({
        method: 'updatePlaylistContentForStationLocal',
        message: 'Starting single station playlist update',
        metadata: {
            stationID: stationKey,
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
            message: 'Failed to update station playlist',
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: {
                stationID: stationKey,
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

        const isrc = isrcFromSpotifyTrack(track) ?? null;
        const releaseDateYmd = releaseDateYmdFromSpotifyTrack(track) ?? null;

        const spotifyIdRow = await MySQLWrapper.checkAndInsert(
            'nowplaying_spotify_tracks',
            'spotify_id',
            spotifyTrackDuplicateCheckParams(track.id, isrc),
            {
                spotify_track_id: track.id,
                spotify_artist_id: track?.artists[0]?.id || '',
                spotify_isrc: isrc,
                spotify_release_date: releaseDateYmd,
                spotify_artist_title: track?.artists[0]?.name || '',
                spotify_track_title: track.name,
                spotify_duration_ms: track.duration_ms,
                spotify_popularity: track.popularity,
                spotify_timestamp_added: Math.floor(Date.now() / 1000),
            },
        );

        return await resolveCanonicalSpotifyId(MySQLWrapper, spotifyIdRow, isrc);
    } catch (error) {
        logger.warn({
            method: '_resolveSpotifyId',
            message: 'Spotify resolution failed, storing entry without link',
            metadata: {
                searchQuery: query,
                errorMessage: error instanceof Error ? error.message : String(error),
            },
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
            metadata: { chartID: chartKey },
        });
        return;
    }

    const yearWeek = getYearWeek();
    const collectStart = Date.now();

    try {
        const exists = await doesChartWeekExist(chartKey, yearWeek);

        if (exists) {
            logger.info({
                method: 'collectChartData',
                message: 'Chart week already collected, skipping',
                metadata: { chartID: chartKey, yearWeek },
            });
            metricsWrapper.increment('ChartCollectionSkipped', { chartID: chartKey, yearWeek });
            return;
        }

        const tracks = await getCurrentTracks({
            stationID: chartKey,
            scraperProps: chart.scraper,
            parserProps: chart.parser,
        });

        if (!tracks?.fields?.length) {
            logger.warn({
                method: 'collectChartData',
                message: 'No tracks returned for chart',
                metadata: { chartID: chartKey },
            });
            return;
        }

        const enrichedFields = [];
        for (const field of tracks.fields) {
            const spotifyId = await _resolveSpotifyId(field.artist || '', field.title || '');
            enrichedFields.push({ ...field, spotifyId });
        }

        await insertChartEntries(chartKey, yearWeek, enrichedFields);

        const spotifyResolvedCount = enrichedFields.filter((f) => f.spotifyId).length;

        metricsWrapper.report('ChartCollection', [
            { key: 'chartID', value: chartKey },
            { key: 'durationMs', value: Date.now() - collectStart },
            { key: 'trackCount', value: enrichedFields.length },
            { key: 'spotifyResolvedCount', value: spotifyResolvedCount },
            { key: 'success', value: 1 },
        ]);
    } catch (error) {
        logger.error({
            method: 'collectChartData',
            message: 'Failed to collect chart data',
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: { chartID: chartKey, yearWeek },
        });

        metricsWrapper.report('ChartCollection', [
            { key: 'chartID', value: chartKey },
            { key: 'durationMs', value: Date.now() - collectStart },
            { key: 'trackCount', value: 0 },
            { key: 'spotifyResolvedCount', value: 0 },
            { key: 'success', value: 0 },
        ]);
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
            message: 'Queued chart collection',
            metadata: { chartID: chartKey, delaySeconds: delayBySeconds },
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
            metadata: { chartID: chartKey },
        });
        return;
    }

    const syncStart = Date.now();

    try {
        const entries = await getLatestChartEntries(chartKey);

        if (!entries || entries.length === 0) {
            logger.warn({
                method: 'syncChartToSpotify',
                message: 'No chart entries in database',
                metadata: { chartID: chartKey },
            });
            return;
        }

        const trackURIs = entries
            .filter((e) => e.spotify_track_id)
            .map((e) => `spotify:track:${e.spotify_track_id}`);

        if (trackURIs.length === 0) {
            logger.warn({
                method: 'syncChartToSpotify',
                message: 'No Spotify-linked chart entries',
                metadata: { chartID: chartKey },
            });
            return;
        }

        const playlistID = _getPlaylistID(chartKey);
        await Spotify.replaceTracksInPlaylist(playlistID, trackURIs);
        await updatePlaylistMetadata(chartKey);

        logger.info({
            method: 'syncChartToSpotify',
            message: 'Synced chart to Spotify playlist',
            metadata: {
                chartID: chartKey,
                trackCount: trackURIs.length,
                yearWeek: entries[0].chart_year_week,
            },
        });

        metricsWrapper.report('ChartSpotifySync', [
            { key: 'chartID', value: chartKey },
            { key: 'durationMs', value: Date.now() - syncStart },
            { key: 'trackCount', value: trackURIs.length },
            { key: 'success', value: 1 },
        ]);
    } catch (error) {
        logger.error({
            method: 'syncChartToSpotify',
            message: 'Failed to sync chart to Spotify',
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: { chartID: chartKey },
        });

        metricsWrapper.report('ChartSpotifySync', [
            { key: 'chartID', value: chartKey },
            { key: 'durationMs', value: Date.now() - syncStart },
            { key: 'trackCount', value: 0 },
            { key: 'success', value: 0 },
        ]);
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
            message: 'Queued Spotify chart sync',
            metadata: { chartID: chartKey, delaySeconds: delayBySeconds },
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
                chartID: chartKey,
            },
        });

        return Promise.reject();
    }

    logger.debug({
        method: 'refreshChartRemote',
        message: 'Starting single chart refresh',
        metadata: {
            chartID: chartKey,
        },
    });

    try {
        const tracks = await getCurrentTracks({
            stationID: chartKey,
            scraperProps: chart.scraper,
            parserProps: chart.parser,
        });

        await replacePlayList(chartKey, tracks);
    } catch (error) {
        logger.error({
            method: 'refreshChartRemote',
            message: 'Failed to refresh chart',
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: {
                chartID: chartKey,
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
            message: 'Queued chart refresh',
            metadata: { chartID: chartKey, delaySeconds: delayBySeconds },
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
            message: 'Queued station playlist update',
            metadata: { stationID: stationKey, delaySeconds: delayBySeconds },
        });

        stationEnumeration++;
    }
};

export {
    crawlAllStationsToNotifyTrackChanges,
    crawlHistoryChartsToNotifyTrackChanges,
    refreshChartRemote,
    updatePlaylistContentForAllStations,
    refreshChartAll,
    getChartInfo,
    collectChartData,
    collectChartDataAll,
    syncChartToSpotify,
    syncAllChartsToSpotify,
};
