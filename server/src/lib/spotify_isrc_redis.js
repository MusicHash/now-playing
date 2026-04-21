import { DURATION } from '../constants/numbers.js';
import redisWrapper from '../utils/redis_wrapper.js';
import { isrcFromSpotifyTrack } from './spotify_track_isrc.js';

export const SPOTIFY_TRACK_ISRC_REDIS_PREFIX = 'SPOTIFY_TRACK_ISRC:';

/**
 * Redis key for a Spotify track id → stored ISRC string (or empty string if search payload had no ISRC).
 */
export function spotifyTrackIsrcRedisKey(trackId) {
    return `${SPOTIFY_TRACK_ISRC_REDIS_PREFIX}${String(trackId)}`;
}

/**
 * Store ISRC (or `''`) for each track in a Spotify search `body`, same TTL as song search cache.
 * Called from `searchTracksWithCache` on both cache hits and fresh API responses (same payload, no extra calls).
 * `/actions/backfill_spotify_isrc` fills MySQL from these keys only (no Spotify track API).
 *
 * @param {Record<string, unknown> | null | undefined} body
 */
export async function indexTrackIsrcFromSearchBody(body) {
    const items = body?.tracks?.items;
    if (!Array.isArray(items)) {
        return;
    }

    for (const track of items) {
        const id = track?.id;
        if (!id) {
            continue;
        }
        const isrc = isrcFromSpotifyTrack(track);
        const payload = isrc ?? '';
        await redisWrapper.set(spotifyTrackIsrcRedisKey(id), payload, DURATION.OF_1_YEAR);
    }
}
