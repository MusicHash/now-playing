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
    /** Rows in DB missing for this `spotify_track_id` (cache has ISRC but no matching row). */
    let mysqlNoRow = 0;

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

            const tidStr = String(tid);

            if (dryRun) {
                const [rows] = await MySQLWrapper.query(
                    `SELECT spotify_isrc FROM nowplaying_spotify_tracks WHERE spotify_track_id = ? LIMIT 1`,
                    [tidStr],
                );
                if (!rows?.length) {
                    mysqlNoRow += 1;
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
                mysqlUpdated += 1;
                continue;
            }

            /**
             * Update every row for this track id that still needs ISRC. `SELECT … LIMIT 1` was wrong when
             * duplicate `spotify_track_id` rows exist (no UNIQUE): we could read the row that already had
             * ISRC and skip while another row for the same id stayed NULL.
             */
            const [updResult] = await MySQLWrapper.query(
                `UPDATE nowplaying_spotify_tracks
                 SET spotify_isrc = ?
                 WHERE spotify_track_id = ?
                   AND (spotify_isrc IS NULL OR spotify_isrc = '')`,
                [isrc, tidStr],
            );
            const affected = Number(updResult?.affectedRows ?? 0);
            if (affected > 0) {
                mysqlUpdated += affected;
                continue;
            }

            const [[exists]] = await MySQLWrapper.query(
                `SELECT COUNT(*) AS c FROM nowplaying_spotify_tracks WHERE spotify_track_id = ?`,
                [tidStr],
            );
            if (Number(exists?.c ?? 0) === 0) {
                mysqlNoRow += 1;
            } else {
                mysqlSkippedAlready += 1;
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
        mysql_no_matching_row: mysqlNoRow,
        stopped_early: Boolean(maxKeys > 0 && keysVisited >= maxKeys),
    };
}
