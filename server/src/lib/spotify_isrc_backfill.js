import MySQLWrapper from '../utils/mysql_wrapper.js';
import redisWrapper from '../utils/redis_wrapper.js';
import logger from '../utils/logger.js';
import { spotifyTrackIsrcRedisKey } from './spotify_isrc_redis.js';

/** Default number of `nowplaying_spotify_tracks` rows to process per action invocation. */
export const DEFAULT_ISRC_BACKFILL_DB_BATCH = 500;

/** Hard cap per request (avoid accidental huge runs). */
export const MAX_ISRC_BACKFILL_DB_BATCH = 5000;

/**
 * Fill `spotify_isrc` from Redis only (`SPOTIFY_TRACK_ISRC:<trackId>`), populated when
 * `searchTracksWithCache` returns a search body (cache hit or API miss). Does not call Spotify APIs.
 *
 * @param {{ limit?: unknown }} [options]
 * @returns {Promise<{
 *   limit: number,
 *   rows_selected: number,
 *   redis_hits: number,
 *   redis_misses: number,
 *   filled_isrc: number,
 *   marked_no_isrc: number,
 *   remaining_missing_before: number,
 *   remaining_missing_after: number,
 * }>}
 */
export async function backfillSpotifyIsrcBatch(options = {}) {
    const raw = Number.parseInt(String(options.limit ?? DEFAULT_ISRC_BACKFILL_DB_BATCH), 10);
    const limit = Math.min(
        MAX_ISRC_BACKFILL_DB_BATCH,
        Math.max(1, Number.isFinite(raw) ? raw : DEFAULT_ISRC_BACKFILL_DB_BATCH),
    );

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

    const [[{ cnt }]] = await MySQLWrapper.query(
        `SELECT COUNT(*) AS cnt FROM nowplaying_spotify_tracks
         WHERE spotify_isrc IS NULL OR spotify_isrc = ''`,
    );
    const remainingBefore = Number(cnt) || 0;

    const [rows] = await MySQLWrapper.query(
        `SELECT spotify_track_id FROM nowplaying_spotify_tracks
         WHERE spotify_isrc IS NULL OR spotify_isrc = ''
         ORDER BY spotify_id ASC
         LIMIT ?`,
        [limit],
    );

    const trackIds = [...new Set(rows.map((r) => String(r.spotify_track_id)))];
    let redisHits = 0;
    let redisMisses = 0;
    let filledIsrc = 0;
    let markedNoIsrc = 0;

    if (trackIds.length === 0) {
        return {
            limit,
            rows_selected: 0,
            redis_hits: 0,
            redis_misses: 0,
            filled_isrc: 0,
            marked_no_isrc: 0,
            remaining_missing_before: remainingBefore,
            remaining_missing_after: remainingBefore,
        };
    }

    for (const tid of trackIds) {
        let cached;
        try {
            cached = await redisWrapper.get(spotifyTrackIsrcRedisKey(tid));
        } catch (error) {
            redisMisses += 1;
            logger.warn({
                method: 'backfillSpotifyIsrcBatch',
                message: 'Redis get failed for track ISRC key',
                error: error instanceof Error ? error.message : String(error),
                metadata: { tid },
            });
            continue;
        }

        if (cached === null) {
            redisMisses += 1;
            continue;
        }

        redisHits += 1;
        const isrc = typeof cached === 'string' && cached.trim() ? cached.trim() : null;
        const stored = isrc ?? '';

        const [updHeader] = await MySQLWrapper.query(
            `UPDATE nowplaying_spotify_tracks
             SET spotify_isrc = ?
             WHERE spotify_track_id = ?
               AND (spotify_isrc IS NULL OR spotify_isrc = '')`,
            [stored, tid],
        );
        const affected = Number(updHeader?.affectedRows ?? 0);
        if (affected === 0) {
            continue;
        }

        if (isrc) {
            filledIsrc += 1;
        } else {
            markedNoIsrc += 1;
        }
    }

    const [[{ cnt: cntAfter }]] = await MySQLWrapper.query(
        `SELECT COUNT(*) AS cnt FROM nowplaying_spotify_tracks
         WHERE spotify_isrc IS NULL OR spotify_isrc = ''`,
    );
    const remainingAfter = Number(cntAfter) || 0;

    return {
        limit,
        rows_selected: trackIds.length,
        redis_hits: redisHits,
        redis_misses: redisMisses,
        filled_isrc: filledIsrc,
        marked_no_isrc: markedNoIsrc,
        remaining_missing_before: remainingBefore,
        remaining_missing_after: remainingAfter,
    };
}
