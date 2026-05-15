import SpotifyWebApi from 'spotify-web-api-node';

import { DURATION } from '../../constants/numbers.js';
import logger from '../../utils/logger.js';
import redisWrapper from '../../utils/redis_wrapper.js';
import { normalizeStringForCacheKey } from '../../utils/normalize_string_cache_key.js';
import { cleanNames } from '../../utils/strings.js';
import metricsWrapper from '../../utils/metrics_wrapper.js';

const scopes = ['playlist-read-private', 'playlist-modify-private', 'playlist-modify-public'];

/**
 * Proxy every SpotifyWebApi method to record latency and success/failure
 * as a `SpotifyApiCall` custom event in New Relic.
 */
const wrapSpotifyApi = function (spotifyApi) {
    const wrapper = Object.create(Object.getPrototypeOf(spotifyApi));

    const excludedMethods = ['constructor'];
    const apiMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(spotifyApi)).filter(
        (name) => typeof spotifyApi[name] === 'function' && !excludedMethods.includes(name),
    );

    apiMethods.forEach((methodName) => {
        wrapper[methodName] = async function (...args) {
            const start = Date.now();
            try {
                const result = await spotifyApi[methodName].apply(spotifyApi, args);
                metricsWrapper.report('SpotifyApiCall', [
                    { key: 'method', value: methodName },
                    { key: 'durationMs', value: Date.now() - start },
                    { key: 'success', value: 1 },
                ]);
                return result;
            } catch (error) {
                metricsWrapper.report('SpotifyApiCall', [
                    { key: 'method', value: methodName },
                    { key: 'durationMs', value: Date.now() - start },
                    { key: 'success', value: 0 },
                ]);
                throw error;
            }
        };
    });

    Object.keys(spotifyApi).forEach((key) => {
        if (typeof spotifyApi[key] !== 'function') {
            wrapper[key] = spotifyApi[key];
        }
    });

    return wrapper;
};

class Spotify {
    api = null;
    #isConnected = false;
    #refreshInterval = null;

    constructor() {
        this.api = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri: process.env.SPOTIFY_CALLBACK_ENDPOINT,
        });

        this.api = wrapSpotifyApi(this.api);
    }

    /**
     *
     * @returns
     */
    async connect() {
        let token;

        if (true === this.#isConnected) {
            return true;
        }

        try {
            // Retrieve an access token
            token = await this.api.clientCredentialsGrant();
            this.api.setAccessToken(token.body.access_token);
            this.#isConnected = true;
        } catch (error) {
            logger.error({
                method: 'Spotify.connect',
                message: 'Client credentials grant failed',
                error,
            });
        }
    }

    /**
     *
     * @returns
     */
    async auth(code, error, res) {
        if (error) {
            logger.error({
                method: 'Spotify.auth',
                message: 'OAuth callback reported error',
                metadata: { oauthError: String(error) },
            });

            res.send(`Callback Error: ${error}`);
            return;
        }

        try {
            let authorizationCode = await this.api.authorizationCodeGrant(code);

            if (authorizationCode.body.expires_in < 1500) {
                logger.info({
                    method: 'Spotify.auth',
                    message: 'Token lifetime short, renewing',
                    metadata: { expiresIn: authorizationCode.body.expires_in },
                });

                authorizationCode = await this.api.refreshAccessToken();
            }

            const accessToken = authorizationCode.body.access_token;
            const refreshToken = authorizationCode.body.refresh_token;
            const expiresIn = authorizationCode.body.expires_in;

            this.setAccessToken(accessToken);
            this.setRefreshToken(refreshToken);

            logger.info({
                method: 'Spotify.auth',
                message: 'OAuth tokens stored',
                metadata: {
                    expiresIn,
                    hasRefreshToken: Boolean(refreshToken),
                },
            });

            res.send('Success! You can now close the window.');

            // Clear any existing refresh interval
            if (this.#refreshInterval) {
                clearInterval(this.#refreshInterval);
            }

            this.#refreshInterval = setInterval(
                async () => {
                    try {
                        const token = await this.api.refreshAccessToken();
                        const accessToken = token.body.access_token;

                        this.setAccessToken(accessToken);

                        logger.info({
                            method: 'Spotify.auth',
                            message: 'Access token refreshed on interval',
                        });
                    } catch (error) {
                        logger.error({
                            method: 'Spotify.auth',
                            message: 'Interval token refresh failed',
                            error,
                        });
                    }
                },
                (expiresIn / 2) * 1000,
            );
        } catch (error) {
            logger.error({
                method: 'Spotify.auth',
                message: 'OAuth token exchange failed',
                error,
                metadata: {
                    hasAuthCode: Boolean(code),
                },
            });

            res.send(`Error getting tokens: ${error}`);
        }
    }

    /**
     *
     * @returns
     */
    setAccessToken(accessToken) {
        return this.api.setAccessToken(accessToken);
    }

    /**
     * Cleanup method to clear the refresh interval
     */
    cleanup() {
        if (this.#refreshInterval) {
            clearInterval(this.#refreshInterval);
            this.#refreshInterval = null;
            logger.info({
                method: 'Spotify.cleanup',
                message: 'Token refresh interval cleared',
            });
        }
    }

    /**
     *
     * @returns
     */
    async setRefreshToken(refreshToken) {
        return await this.api.setRefreshToken(refreshToken);
    }

    /**
     *
     * @returns
     */
    async createAuthorizeURL() {
        return await this.api.createAuthorizeURL(scopes, 'new');
    }

    /**
     *
     * @returns
     */
    async refreshAccessToken() {
        let token = {};

        try {
            token = await this.api.refreshAccessToken();

            // Save the access token so that it's used in future calls
            this.api.setAccessToken(token.body.access_token);

            logger.info({
                method: 'Spotify.refreshAccessToken',
                message: 'Access token refreshed',
            });
        } catch (error) {
            logger.error({
                method: 'Spotify.refreshAccessToken',
                message: 'Refresh access token failed',
                error,
            });
        }

        return token;
    }

    async searchTracksWithCache(query, limit = 1) {
        const KEY_PREFIX = 'SONG';
        const normalizedQuery = cleanNames(String(query ?? ''));
        const cacheKey = `${KEY_PREFIX}:${normalizeStringForCacheKey(normalizedQuery)}`;
        let searchTracks = null;

        try {
            const cacheStart = Date.now();
            searchTracks = await redisWrapper.get(cacheKey);

            if (searchTracks) {
                searchTracks = JSON.parse(searchTracks);

                metricsWrapper.report('SpotifySearchCache', [
                    { key: 'hit', value: 1 },
                    { key: 'durationMs', value: Date.now() - cacheStart },
                ]);

                const items = searchTracks?.tracks?.items ?? [];
                const top = items[0];
                logger.debug({
                    method: 'searchTracksWithCache',
                    message: 'Cache hit for query, fetching from Redis instead of API call',
                    metadata: {
                        cacheKey,
                        normalizedQuery,
                        limit,
                        query: String(query ?? ''),
                        redisGetMs: Date.now() - cacheStart,
                        cachedTrackCount: items.length,
                        cachedTopResult:
                            top != null
                                ? {
                                      id: top.id,
                                      name: top.name,
                                      artists: top.artists?.map((a) => a.name).join(', ') || undefined,
                                  }
                                : null,
                    },
                });
            } else {
                metricsWrapper.report('SpotifySearchCache', [
                    { key: 'hit', value: 0 },
                    { key: 'durationMs', value: Date.now() - cacheStart },
                ]);

                logger.debug({
                    method: 'searchTracksWithCache',
                    message: 'Cache miss for query',
                    metadata: {
                        cacheKey,
                        normalizedQuery,
                        limit,
                        query: String(query ?? ''),
                        redisGetMs: Date.now() - cacheStart,
                    },
                });

                searchTracks = await this.searchTracks(normalizedQuery, limit);
                await redisWrapper.set(cacheKey, JSON.stringify(searchTracks), DURATION.OF_1_YEAR);
            }
        } catch (error) {
            logger.error({
                method: 'Spotify.searchTracksWithCache',
                message: 'Spotify search cache failed',
                error,
                metadata: {
                    limit,
                    normalizedQuery,
                    cacheKey,
                },
            });

            throw error;
        }

        return searchTracks;
    }

    /**
     *
     * @param {*} query
     * @param {*} limit
     * @returns
     */
    async searchTracks(query, limit = 1) {
        const q = cleanNames(String(query ?? ''));
        try {
            const apiStart = Date.now();
            const res = await this.api.searchTracks(q, {
                limit,
            });
            const body = res.body;
            const items = body?.tracks?.items ?? [];
            const top = items[0];
            const tracksPage = body?.tracks ?? {};

            logger.debug({
                method: 'searchTracks',
                message: 'Search API called successfully',
                metadata: {
                    query: String(query ?? ''),
                    normalizedQuery: q,
                    limit,
                    requestLimit: tracksPage.limit,
                    offset: tracksPage.offset,
                    apiDurationMs: Date.now() - apiStart,
                    trackCountReturned: items.length,
                    tracksTotalAvailable: tracksPage.total,
                    topResult:
                        top != null
                            ? {
                                  id: top.id,
                                  name: top.name,
                                  artists: top.artists?.map((a) => a.name).join(', ') || undefined,
                              }
                            : null,
                },
            });

            return body;
        } catch (error) {
            logger.error({
                method: 'searchTracks',
                message: 'Search API failed',
                error,
                metadata: {
                    query: String(query ?? ''),
                    normalizedQuery: q,
                    limit,
                },
            });

            throw error;
        }
    }

    /**
     * Full track objects for up to 50 ids (Spotify API limit per request).
     * @param {string[]} trackIds
     * @returns {Promise<Array<Record<string, unknown> | null>>}
     */
    async getTracksByIds(trackIds) {
        const ids = (trackIds || []).filter(Boolean).map(String);
        if (ids.length === 0) {
            return [];
        }

        await this.connect();

        try {
            const res = await this.api.getTracks(ids);
            const tracks = res.body?.tracks ?? [];

            logger.debug({
                method: 'getTracksByIds',
                message: 'getTracks API called successfully',
                metadata: { count: ids.length },
            });

            return tracks;
        } catch (error) {
            logger.error({
                method: 'getTracksByIds',
                message: 'getTracks API failed',
                error,
                metadata: { count: ids.length },
            });

            throw error;
        }
    }

    /**
     *
     * @param {*} playlistID
     * @returns
     */
    async getPlaylist(playlistID) {
        try {
            const playlist = await this.api.getPlaylist(playlistID);

            logger.debug({
                method: 'getPlaylist',
                message: 'getPlaylist API called successfully',
                metadata: {
                    args: [...arguments],
                    playlist,
                },
            });

            return playlist.body;
        } catch (error) {
            logger.error({
                method: 'getPlaylist',
                message: 'getPlaylist failed',
                error,
                metadata: {
                    args: [...arguments],
                },
            });
        }
    }

    /**
     *
     * @param {*} playlistID
     * @param {*} trackIDs
     * @param {*} position
     * @param {*} handleDuplicates
     * @returns
     */
    async addTracksToPlaylist(playlistID, trackIDs = [], position = 0, handleDuplicates = true) {
        if (true === handleDuplicates) {
            let trackFromPlaylist = await this.findTrackInPlaylist(trackIDs[0], playlistID);

            // unique only, skip
            if (-1 !== trackFromPlaylist) {
                // already first, check position
                if (0 < trackFromPlaylist.position) {
                    await this.reorderTracksInPlaylist(playlistID, 1, trackFromPlaylist.position, 0);

                    logger.debug({
                        method: 'addTracksToPlaylist',
                        message: 'TrackID found but already exists, bumping to be first',
                        metadata: {
                            args: [...arguments],
                            name: trackFromPlaylist.name,
                            trackID: trackIDs[0],
                            trackPosition: trackFromPlaylist.position,
                        },
                    });
                } else {
                    logger.debug({
                        method: 'addTracksToPlaylist',
                        message: 'TrackID already exists and first in playlist, SKIPPING',
                        metadata: {
                            args: [...arguments],
                            name: trackFromPlaylist.name,
                            trackPosition: trackFromPlaylist.position,
                            id: trackIDs[0],
                        },
                    });
                }

                return true;
            }
        }

        logger.info({
            method: 'Spotify.addTracksToPlaylist',
            message: 'Adding tracks to playlist',
            metadata: {
                playlistID,
                trackCount: trackIDs.length,
                position,
            },
        });

        try {
            const playlist = await this.api.addTracksToPlaylist(playlistID, trackIDs, {
                position,
            });
            await redisWrapper.del(`PLAYLIST:${playlistID}`); // clean cache

            logger.debug({
                method: 'addTracksToPlaylist',
                message: 'addTracksToPlaylist API called successfully',
                metadata: {
                    args: [...arguments],
                    playlist,
                },
            });

            return true;
        } catch (error) {
            logger.error({
                method: 'addTracksToPlaylist',
                message: 'Failed to adding trackIDs to playlist',
                error,
                metadata: {
                    args: [...arguments],
                },
            });
        }
    }

    /**
     *
     * @param {*} trackID
     * @param {*} playlistID
     * @returns int
     */
    async findTrackInPlaylist(trackID, playlistID) {
        let playlistTracks = await this.getPlaylistTracksAllPages(playlistID);
        let uriTracks = this._extractUriFromTracks(playlistTracks);

        return undefined !== uriTracks[trackID] ? uriTracks[trackID] : -1;
    }

    /**
     *
     *
     * @param {*} playlistID
     * @param {*} limit
     * @param {*} offset
     * @param {*} fields
     * @returns
     */
    async getPlaylistTracksWithCache(playlistID, limit = 100, offset = 0, fields = 'limit,offset,total,items(track(uri,name))') {
        const KEY_PREFIX = 'PLAYLIST';
        const cacheKey = `${KEY_PREFIX}:${playlistID}`;
        const fieldKey = `limit:${limit}:offset:${offset}`;
        let playlist = null;

        try {
            playlist = await redisWrapper.getHash(cacheKey, fieldKey);

            if (playlist) {
                playlist = JSON.parse(playlist);

                logger.debug({
                    method: 'getPlaylistTracksWithCache',
                    message: 'Cache hit for playlist, fetching from cache',
                    metadata: {
                        args: [...arguments],
                        playlist,
                    },
                });
            } else {
                logger.debug({
                    method: 'getPlaylistTracksWithCache',
                    message: 'Cache miss for playlist',
                    metadata: {
                        args: [...arguments],
                        playlist,
                    },
                });

                playlist = await this.getPlaylistTracks(playlistID, limit, offset, fields);
                await redisWrapper.addHash(cacheKey, fieldKey, JSON.stringify(playlist), DURATION.OF_1_HOUR);
            }
        } catch (error) {
            logger.error({
                method: 'getPlaylistTracksWithCache',
                message: 'Cache fetching failed',
                error,
                metadata: {
                    args: [...arguments],
                },
            });

            throw error;
        }

        return playlist;
    }

    /**
     *
     *
     * @param {*} playlistID
     * @param {*} limit
     * @param {*} offset
     * @param {*} fields
     * @returns
     */
    async getPlaylistTracks(playlistID, limit = 100, offset = 0, fields = 'limit,offset,total,items(track(uri,name))') {
        try {
            const playlist = await this.api.getPlaylistTracks(playlistID, {
                offset,
                limit,
                fields,
            });

            logger.debug({
                method: 'getPlaylistTracks',
                message: 'getPlaylistTracks API called successfully',
                metadata: {
                    args: [...arguments],
                    playlist,
                },
            });

            return playlist.body;
        } catch (error) {
            logger.error({
                method: 'getPlaylistTracks',
                message: 'Failed to fetch playlist tracks',
                error,
                metadata: {
                    args: [...arguments],
                },
            });
        }
    }

    /**
     *
     *
     * @param {*} playlistID
     * @param {*} limit
     * @param {*} offset
     * @param {*} fields
     * @returns
     */
    async getPlaylistTracksAllPages(playlistID, limit = 100, offset = 0, fields = 'limit,offset,total,items(track(uri,name))') {
        let firstPage = await this.getPlaylistTracksWithCache(playlistID, limit, offset, fields);
        let totalPages = Math.ceil((firstPage.total || 1) / limit);

        let allPagesPromise = Array.from(new Array(totalPages - 1), (_, index) => index + 1).map((pageNumber) =>
            this.getPlaylistTracksWithCache(playlistID, limit, limit * pageNumber, fields).catch((error) =>
                logger.error({
                    method: 'getPlaylistAllPages',
                    message: 'Failed getting playlist tracks by page',
                    error,
                    metadata: {
                        args: [...arguments],
                        pageNumber,
                        totalPages,
                    },
                }),
            ),
        );

        return await Promise.all(allPagesPromise)
            .then((playlists) => {
                let output = firstPage;

                playlists.forEach((playlist, idx) => {
                    output.items.push(...playlist.items);
                });

                output.pages = totalPages;
                delete output.offset; // clean up, not needed in multi page response

                return output;
            })
            .catch((error) => {
                // there was an error
                logger.error({
                    method: 'getPlaylistAllPages',
                    message: 'Failed to fetch all pages trackIDs',
                    error,
                    metadata: {
                        args: [...arguments],
                        pageNumber,
                        totalPages,
                    },
                });
            });
    }

    /**
     * Update playlist details
     *
     * @param {*} playlistID
     * @param {*} props
     * @returns
     */
    async playlistUpdateMetadata(playlistID, props = {}) {
        try {
            const playlist = await this.api.changePlaylistDetails(playlistID, props);

            logger.debug({
                method: 'playlistUpdateMetadata',
                message: 'Playlist metadata updated successfully',
                metadata: {
                    args: [...arguments],
                    playlist,
                },
            });

            return playlist.body;
        } catch (error) {
            logger.error({
                method: 'playlistUpdateMetadata',
                message: 'Failed to update playlist metadata',
                error,
                metadata: {
                    args: [...arguments],
                },
            });
        }
    }

    // re-order a a track in a list
    async reorderTracksInPlaylist(playlistID, rangeLength = 1, rangeStart = 0, insertBefore = 0) {
        let options = {
            range_length: rangeLength,
        };

        try {
            const playlist = await this.api.reorderTracksInPlaylist(playlistID, rangeStart, insertBefore, options);
            await redisWrapper.del(`PLAYLIST:${playlistID}`); // clean cache

            logger.debug({
                method: 'reorderTracksInPlaylist',
                message: 'Reordered tracks in playlist successfully',
                metadata: {
                    args: [...arguments],
                    playlist,
                },
            });

            return playlist.body;
        } catch (error) {
            logger.error({
                method: 'reorderTracksInPlaylist',
                message: 'Failed to reorder tracks in playlist',
                error,
                metadata: {
                    args: [...arguments],
                },
            });
        }
    }

    // replace complete list of tracks (override?)
    async replaceTracksInPlaylist(playlistID, tracksList = []) {
        try {
            const playlist = await this.api.replaceTracksInPlaylist(playlistID, tracksList);
            await redisWrapper.del(`PLAYLIST:${playlistID}`); // clean cache

            logger.debug({
                method: 'replaceTracksInPlaylist',
                message: 'Replaced playlist tracks',
                metadata: {
                    args: [...arguments],
                    playlist,
                },
            });

            return playlist.body;
        } catch (error) {
            logger.error({
                method: 'replaceTracksInPlaylist',
                message: 'Failed to replace playlist tracks',
                error,
                metadata: {
                    args: [...arguments],
                },
            });
        }
    }

    // replace complete list of tracks
    async slicePlaylist(playlistID, limit = 100) {
        let maxBatchSize = 100 < limit ? 100 : limit;

        let playlist = await this.getPlaylistTracksAllPages(playlistID, maxBatchSize);
        let tracksListRaw = playlist.items.map((item) => item.track.uri);
        let tracksList = [...new Set(tracksListRaw)]; // removed duplicates

        // cap limit is not above total
        limit = tracksList.length < limit ? Number(tracksList.length) : limit;

        // cut array to length.
        let shorterTracksList = tracksList.slice(0, maxBatchSize);
        let totalPages = Math.ceil(limit / maxBatchSize);

        await this.replaceTracksInPlaylist(playlistID, shorterTracksList);

        if (playlist.limit < limit) {
            for (let pageNumber = 1, lastPage = totalPages - 1; pageNumber <= lastPage; pageNumber++) {
                let batchSize = pageNumber === lastPage ? limit - maxBatchSize * pageNumber : maxBatchSize;
                let offset = maxBatchSize * pageNumber;
                let tracksListSliced = tracksList.slice(offset, offset + batchSize);

                await this.addTracksToPlaylist(playlistID, tracksListSliced, offset, false);
            }
        }

        return Promise.resolve();
    }

    _extractUriFromTracks(tracks) {
        let output = {};

        tracks.items.forEach((item, idx) => {
            output[item.track.uri] = {
                name: item.track.name,
                position: idx,
            };
        });

        return output;
    }
}

export default new Spotify();
