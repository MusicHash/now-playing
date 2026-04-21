/**
 * ONE-TIME: Backfill `nowplaying_spotify_tracks.spotify_isrc` by parsing Spotify search JSON
 * stored under Redis keys `SONG:*` (see `Spotify.searchTracksWithCache`).
 *
 * Delete after use:
 * - this file
 * - imports + route handlers + links in `routes/debug.js` mentioning `backfill_spotify_isrc_from_song_cache`
 */

import MySQLWrapper from '../utils/mysql_wrapper.js';
import redisWrapper from '../utils/redis_wrapper.js';
import logger from '../utils/logger.js';
import { indexTrackIsrcFromSearchBody } from './spotify_isrc_redis.js';
import { isrcFromSpotifyTrack } from './spotify_track_isrc.js';

/** Same prefix as `searchTracksWithCache` (`SONG:` + normalized query). */
export const SONG_CACHE_REDIS_PATTERN = 'SONG:*';

/**
 * @param {{ maxKeys?: unknown, dryRun?: unknown }} [options]
 */
export async function backfillSpotifyIsrcFromSongRedisCache(options = {}) {
    const rawMax = Number.parseInt(String(options.maxKeys ?? 0), 10);
    const maxKeys = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 0;
    const dryRun =
        options.dryRun === true ||
        options.dryRun === '1' ||
        options.dryRun === 'true';

    if (!MySQLWrapper.isEnabled()) {
        const err = new Error('MySQL is not configured');
        err.code = 'MYSQL_DISABLED';
        throw err;
    }

    if (!redisWrapper.isEnabled()) {
        const err = new Error('Redis is not configured');
        err.code = 'REDIS_DISABLED';
        throw err;
    }

    let keysVisited = 0;
    let parseErrors = 0;
    let tracksSeen = 0;
    let mysqlUpdated = 0;
    let mysqlSkippedNoIsrc = 0;
    let mysqlSkippedAlready = 0;

    await redisWrapper.forEachKeyMatching(SONG_CACHE_REDIS_PATTERN, async (key) => {
        if (maxKeys > 0 && keysVisited >= maxKeys) {
            return false;
        }

        keysVisited += 1;

        let raw;
        try {
            raw = await redisWrapper.get(key);
        } catch (error) {
            parseErrors += 1;
            logger.warn({
                method: 'backfillSpotifyIsrcFromSongRedisCache',
                message: 'Redis get failed for SONG cache key',
                error: error instanceof Error ? error.message : String(error),
                metadata: { key },
            });
            return;
        }

        if (raw === null || raw === undefined) {
            return;
        }

        let body;
        try {
            body = JSON.parse(String(raw));
        } catch {
            parseErrors += 1;
            return;
        }

        if (!dryRun) {
            try {
                await indexTrackIsrcFromSearchBody(body);
            } catch (error) {
                logger.warn({
                    method: 'backfillSpotifyIsrcFromSongRedisCache',
                    message: 'indexTrackIsrcFromSearchBody failed',
                    error: error instanceof Error ? error.message : String(error),
                    metadata: { key },
                });
            }
        }

        const items = body?.tracks?.items;
        if (!Array.isArray(items)) {
            return;
        }

        for (const track of items) {
            const tid = track?.id;
            if (!tid) {
                continue;
            }
            tracksSeen += 1;
            const isrc = isrcFromSpotifyTrack(track);
            if (!isrc) {
                mysqlSkippedNoIsrc += 1;
                continue;
            }

            const [rows] = await MySQLWrapper.query(
                `SELECT spotify_isrc FROM nowplaying_spotify_tracks WHERE spotify_track_id = ? LIMIT 1`,
                [String(tid)],
            );
            if (!rows?.length) {
                continue;
            }
            const prev = rows[0].spotify_isrc;
            const missing =
                prev === null ||
                prev === undefined ||
                (typeof prev === 'string' && prev.trim() === '');
            if (!missing) {
                mysqlSkippedAlready += 1;
                continue;
            }

            if (dryRun) {
                mysqlUpdated += 1;
            } else {
                await MySQLWrapper.update(
                    'nowplaying_spotify_tracks',
                    { spotify_isrc: isrc },
                    { spotify_track_id: String(tid) },
                );
                mysqlUpdated += 1;
            }
        }
    });

    return {
        pattern: SONG_CACHE_REDIS_PATTERN,
        dry_run: dryRun,
        max_keys: maxKeys || null,
        keys_visited: keysVisited,
        parse_errors: parseErrors,
        tracks_seen: tracksSeen,
        mysql_updated: mysqlUpdated,
        mysql_skipped_no_isrc: mysqlSkippedNoIsrc,
        mysql_skipped_already_set: mysqlSkippedAlready,
        stopped_early: Boolean(maxKeys > 0 && keysVisited >= maxKeys),
    };
}
