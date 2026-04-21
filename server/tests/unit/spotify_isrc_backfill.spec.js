import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { backfillSpotifyIsrcBatch } from '../../src/lib/spotify_isrc_backfill.js';
import { backfillSpotifyIsrcFromSongRedisCache } from '../../src/lib/spotify_isrc_backfill_song_cache.js';
import MySQLWrapper from '../../src/utils/mysql_wrapper.js';
import redisWrapper from '../../src/utils/redis_wrapper.js';
import { spotifyTrackIsrcRedisKey } from '../../src/lib/spotify_isrc_redis.js';

describe('spotify ISRC backfill', () => {
    beforeEach(() => {
        jest.spyOn(MySQLWrapper, 'isEnabled').mockReturnValue(true);
        jest.spyOn(redisWrapper, 'isEnabled').mockReturnValue(true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('backfillSpotifyIsrcBatch', () => {
        it('updates MySQL from SPOTIFY_TRACK_ISRC Redis keys', async () => {
            const trackId = 'abc123';
            const isrc = 'USRC17607839';

            const query = jest.spyOn(MySQLWrapper, 'query').mockImplementation(async (sql, params) => {
                if (String(sql).includes('COUNT(*)')) {
                    return [[{ cnt: 1 }]];
                }
                if (String(sql).includes('SELECT spotify_track_id')) {
                    return [[{ spotify_track_id: trackId }]];
                }
                throw new Error(`unexpected query: ${sql}`);
            });

            const update = jest.spyOn(MySQLWrapper, 'update').mockResolvedValue({ affectedRows: 1 });

            const get = jest.spyOn(redisWrapper, 'get').mockImplementation(async (key) => {
                if (key === spotifyTrackIsrcRedisKey(trackId)) {
                    return isrc;
                }
                return null;
            });

            const result = await backfillSpotifyIsrcBatch({ limit: 10 });

            expect(result.rows_selected).toBe(1);
            expect(result.redis_hits).toBe(1);
            expect(result.filled_isrc).toBe(1);
            expect(update).toHaveBeenCalledWith(
                'nowplaying_spotify_tracks',
                { spotify_isrc: isrc },
                { spotify_track_id: trackId },
            );

            query.mockRestore();
            update.mockRestore();
            get.mockRestore();
        });
    });

    describe('backfillSpotifyIsrcFromSongRedisCache', () => {
        it('parses SONG:* JSON and updates MySQL when ISRC present', async () => {
            const trackId = '4iV5W9uYEdYUVa79Axb7Rh';
            const isrc = 'GBUM71507854';

            const searchBody = {
                tracks: {
                    items: [
                        {
                            id: trackId,
                            external_ids: { isrc },
                            name: 'Test',
                            artists: [{ id: 'a1', name: 'Artist' }],
                            duration_ms: 200000,
                            popularity: 50,
                        },
                    ],
                },
            };

            const query = jest.spyOn(MySQLWrapper, 'query').mockImplementation(async (sql, params) => {
                if (String(sql).includes('spotify_isrc')) {
                    expect(params).toEqual([trackId]);
                    return [[{ spotify_isrc: null }]];
                }
                throw new Error(`unexpected query: ${sql}`);
            });

            const update = jest.spyOn(MySQLWrapper, 'update').mockResolvedValue({ affectedRows: 1 });

            let forEachCalls = 0;
            jest.spyOn(redisWrapper, 'forEachKeyMatching').mockImplementation(async (pattern, onKey) => {
                expect(pattern).toBe('SONG:*');
                forEachCalls += 1;
                await onKey('SONG:testquery');
                return 1;
            });

            const get = jest.spyOn(redisWrapper, 'get').mockResolvedValue(JSON.stringify(searchBody));
            const set = jest.spyOn(redisWrapper, 'set').mockResolvedValue('OK');

            const result = await backfillSpotifyIsrcFromSongRedisCache({ maxKeys: 0 });

            expect(result.keys_visited).toBe(1);
            expect(result.mysql_updated).toBe(1);
            expect(forEachCalls).toBe(1);
            expect(update).toHaveBeenCalledWith(
                'nowplaying_spotify_tracks',
                { spotify_isrc: isrc },
                { spotify_track_id: trackId },
            );

            query.mockRestore();
            update.mockRestore();
            get.mockRestore();
            set.mockRestore();
        });

        it('dryRun does not call update', async () => {
            const trackId = 'tid';
            const searchBody = {
                tracks: {
                    items: [{ id: trackId, external_ids: { isrc: 'USX1234567890' }, name: 'x', artists: [{}] }],
                },
            };

            jest.spyOn(MySQLWrapper, 'query').mockImplementation(async (sql) => {
                if (String(sql).includes('spotify_isrc')) {
                    return [[{ spotify_isrc: null }]];
                }
                throw new Error(sql);
            });

            const update = jest.spyOn(MySQLWrapper, 'update');

            jest.spyOn(redisWrapper, 'forEachKeyMatching').mockImplementation(async (_pattern, onKey) => {
                await onKey('SONG:q');
                return 1;
            });

            jest.spyOn(redisWrapper, 'get').mockResolvedValue(JSON.stringify(searchBody));

            const result = await backfillSpotifyIsrcFromSongRedisCache({ dryRun: true });

            expect(result.mysql_updated).toBe(1);
            expect(update).not.toHaveBeenCalled();

            update.mockRestore();
        });
    });
});
