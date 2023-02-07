import dotenv from 'dotenv';
dotenv.config();

import SpotifyWebApi from 'spotify-web-api-node';

import logger from '../../utils/logger.js';

const scopes = [
        'playlist-read-private',
        'playlist-modify-private',
        'playlist-modify-public'
    ];

class Spotify {
    api = null;
    #isConnected = false;

    constructor() {
        this.api = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri: process.env.SPOTIFY_CALLBACK_ENDPOINT,
        });
    }


    /**
     * 
     * @returns 
     */
    async connect() {
        if (true === this.#isConnected) {
            return true;
        }

        try {
            // Retrieve an access token
            const token = await this.api.clientCredentialsGrant();
            this.api.setAccessToken(token.body.access_token); //
            this.#isConnected = true;
        } catch(error) {
            logger.error({
                message: 'Failed retrieving an access token',
                error,
                metadata: {
                    token,
                },
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
                method: 'auth',
                message: 'Callback Error',
                error,
            });

            res.send(`Callback Error: ${error}`);
            return;
        }

        try {
            const authorizationCode = await this.api.authorizationCodeGrant(code);

            if (authorizationCode.body.expires_in < 1500) {
                logger.info({
                    method: 'authorizationCode',
                    message: 'Token too short, renewing...',
                });

                authorizationCode = await this.api.refreshAccessToken();
            }

            const accessToken = authorizationCode.body.access_token;
            const refreshToken = authorizationCode.body.refresh_token;
            const expiresIn = authorizationCode.body.expires_in;

            this.setAccessToken(accessToken);
            this.setRefreshToken(refreshToken);

            logger.info({
                method: 'auth',
                message: `Successfully retrieved access token. Expires in ${expiresIn} s.`,
                metadata: {
                    accessToken,
                    refreshToken,
                },
            });

            res.send('Success! You can now close the window.');

            setInterval(async () => {
                const token = await this.api.refreshAccessToken();
                const accessToken = token.body.access_token;

                this.setAccessToken(accessToken);

                logger.info({
                    method: 'auth',
                    message: 'The access token has been refreshed',
                    metadata: {
                        accessToken,
                    },
                });

            }, expiresIn / 2 * 1000);

        } catch (error) {
            logger.error({
                method: 'auth',
                message: 'Error getting tokens',
                error,
                metadata: {
                    code,
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
     * 
     * @returns 
     */
    setRefreshToken(refreshToken) {
        return this.api.setRefreshToken(refreshToken);
    }


    /**
     * 
     * @returns 
     */
    createAuthorizeURL() {
        return this.api.createAuthorizeURL(scopes, 'new');
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
                method: 'refreshAccessToken',
                message: 'Access token refreshed successfully',
            });
        } catch (error) {
            logger.error({
                method: 'refreshAccessToken',
                message: 'Failed to refresh access token',
                error,
                metadata: {
                    token,
                },
            });
        }
        
        return token;
    }


    /**
     * 
     * @param {*} query 
     * @param {*} limit 
     * @returns 
     */
    async searchTracks(query, limit = 1) {
        try {
            const searchTracks = await this.api.searchTracks(query, {
                limit,
            });

            logger.debug({
                method: 'searchTracks',
                message: 'Search API called successfully',
                metadata: {
                    args: [...arguments],
                    searchTracks,
                },
            });

            return searchTracks.body;
        } catch (error) {
            logger.error({
                method: 'searchTracks',
                message: 'Search API failed',
                error,
                metadata: {
                    args: [...arguments],
                },
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
            method: 'addTracksToPlaylist',
            message: 'Adding trackIDs to a playlist',
            metadata: {
                args: [...arguments],
            },
        });

        try {
            const playlist = await this.api.addTracksToPlaylist(playlistID, trackIDs, {
                    position
                });
            
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
        
        return (undefined !== uriTracks[trackID]) ? uriTracks[trackID] : - 1;
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
        } catch(error) {
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

        let firstPage = await this.getPlaylistTracks(playlistID, limit, offset, fields);
        let totalPages = Math.ceil((firstPage.total || 1) / limit);
        
        let allPagesPromise = Array.from(new Array(totalPages-1), (_, index) => index+1).map(
            pageNumber => this.getPlaylistTracks(playlistID, limit, limit * pageNumber, fields)
                .catch(
                    (error) => logger.error({
                        method: 'getPlaylistAllPages',
                        message: 'Failed getting playlist tracks by page',
                        error,
                        metadata: {
                            args: [...arguments],
                            pageNumber,
                            totalPages,
                        },
                    })
                )
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
            }).catch(
                (error) => {
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
                })
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
            range_length: rangeLength
        };

        try {
            const playlist = await this.api.reorderTracksInPlaylist(playlistID, rangeStart, insertBefore, options);

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
        let maxBatchSize = (100 < limit) ? 100 : limit;

        let playlist = await this.getPlaylistTracksAllPages(playlistID, maxBatchSize);
        let tracksListRaw = playlist.items.map((item) => item.track.uri);
        let tracksList = [...new Set(tracksListRaw)]; // removed duplicates

        // cap limit is not above total
        limit = (tracksList.length < limit) ? Number(tracksList.length) : limit;

        // cut array to length.
        let shorterTracksList = tracksList.slice(0, maxBatchSize);
        let totalPages = Math.ceil(limit / maxBatchSize);
        
        await this.replaceTracksInPlaylist(playlistID, shorterTracksList);
        
        if (playlist.limit < limit) {
            for (let pageNumber = 1, lastPage = totalPages-1; pageNumber <= lastPage; pageNumber++) {
                
                let batchSize = (pageNumber === lastPage) ? (limit - (maxBatchSize * pageNumber)) : maxBatchSize;
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
                position: idx
            }
        });

        return output;
    }

}

export default new Spotify();
