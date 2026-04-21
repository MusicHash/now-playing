import Spotify from './providers/spotify.js';
import MySQLWrapper from '../utils/mysql_wrapper.js';
import redisWrapper from '../utils/redis_wrapper.js';
import { DURATION } from '../constants/numbers.js';
import { isrcFromSpotifyTrack } from './spotify_track_isrc.js';
import { spotifyTrackIsrcRedisKey } from './spotify_isrc_redis.js';

/** Spotify Web API allows up to 50 track ids per `get-tracks` request. */
export const SPOTIFY_GET_TRACKS_BATCH_SIZE = 50;

/** Rows to pull from MySQL per HTTP invocation (each row may need a get-tracks call, batched). */
export const DEFAULT_ISRC_API_BACKFILL_ROWS = 500;

export const MAX_ISRC_API_BACKFILL_ROWS = 5000;

/**
 * Fill `spotify_isrc` for rows still missing it by calling Spotify **Get Several Tracks** (no search cache).
 * Use when tracks never appeared as `limit=1` search hits in `SONG:*` (~half of a large catalog is typical).
 *
 * @param {{ limit?: unknown, sleepMs?: unknown }} [options]
 */
export async function backfillSpotifyIsrcFromApi(options = {}) {
    const raw = Number.parseInt(String(options.limit ?? DEFAULT_ISRC_API_BACKFILL_ROWS), 10);
    const limit = Math.min(
        MAX_ISRC_API_BACKFILL_ROWS,
        Math.max(1, Number.isFinite(raw) ? raw : DEFAULT_ISRC_API_BACKFILL_ROWS),
    );

    const rawSleep = Number.parseInt(String(options.sleepMs ?? 0), 10);
    const sleepMs = Number.isFinite(rawSleep) && rawSleep > 0 ? Math.min(rawSleep, 60_000) : 0;

    if (!MySQLWrapper.isEnabled()) {
        const err = new Error('MySQL is not configured');
        err.code = 'MYSQL_DISABLED';
        throw err;
    }

    const [[{ cnt: remainingBefore }]] = await MySQLWrapper.query(
        `SELECT COUNT(*) AS cnt FROM nowplaying_spotify_tracks
         WHERE spotify_isrc IS NULL OR spotify_isrc = ''`,
    );

    const [rows] = await MySQLWrapper.query(
        `SELECT spotify_track_id FROM nowplaying_spotify_tracks
         WHERE spotify_isrc IS NULL OR spotify_isrc = ''
         ORDER BY spotify_id ASC
         LIMIT ?`,
        [limit],
    );

    const ids = [...new Set((rows || []).map((r) => String(r.spotify_track_id)))];
    let spotifyApiCalls = 0;
    let mysqlUpdatedIsrc = 0;
    let mysqlMarkedNoIsrc = 0;
    let tracksUnavailable = 0;

    for (let i = 0; i < ids.length; i += SPOTIFY_GET_TRACKS_BATCH_SIZE) {
        const chunk = ids.slice(i, i + SPOTIFY_GET_TRACKS_BATCH_SIZE);
        const tracks = await Spotify.getTracksByIds(chunk);
        spotifyApiCalls += 1;

        for (let j = 0; j < chunk.length; j += 1) {
            const tid = chunk[j];
            const track = tracks[j];

            if (track === null || track === undefined) {
                tracksUnavailable += 1;
                continue;
            }

            const isrc = isrcFromSpotifyTrack(track);
            const stored = isrc ?? '';

            if (redisWrapper.isEnabled()) {
                try {
                    await redisWrapper.set(spotifyTrackIsrcRedisKey(tid), stored, DURATION.OF_1_YEAR);
                } catch {
                    /* ignore Redis failures; MySQL is authoritative */
                }
            }

            const [updHeader] = await MySQLWrapper.query(
                `UPDATE nowplaying_spotify_tracks
                 SET spotify_isrc = ?
                 WHERE spotify_track_id = ?
                   AND (spotify_isrc IS NULL OR spotify_isrc = '')`,
                [stored, tid],
            );
            const affected = Number(updHeader?.affectedRows ?? 0);
            if (affected > 0) {
                if (isrc) {
                    mysqlUpdatedIsrc += affected;
                } else {
                    mysqlMarkedNoIsrc += affected;
                }
            }
        }

        if (sleepMs > 0 && i + SPOTIFY_GET_TRACKS_BATCH_SIZE < ids.length) {
            await new Promise((r) => setTimeout(r, sleepMs));
        }
    }

    const [[{ cnt: remainingAfter }]] = await MySQLWrapper.query(
        `SELECT COUNT(*) AS cnt FROM nowplaying_spotify_tracks
         WHERE spotify_isrc IS NULL OR spotify_isrc = ''`,
    );

    return {
        limit,
        rows_selected: ids.length,
        spotify_api_calls: spotifyApiCalls,
        mysql_rows_filled_isrc: mysqlUpdatedIsrc,
        mysql_rows_marked_empty_isrc: mysqlMarkedNoIsrc,
        tracks_unavailable: tracksUnavailable,
        remaining_missing_before: Number(remainingBefore) || 0,
        remaining_missing_after: Number(remainingAfter) || 0,
        sleep_ms: sleepMs || null,
    };
}
