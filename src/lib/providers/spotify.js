import SpotifyWebApi from 'spotify-web-api-node';

import logger from '../../utils/logger.js';

const scopes = [
        'playlist-read-private',
        'playlist-modify-private',
        'playlist-modify-public'
    ];

class Spotify {
    api = null;

    constructor() {}


    async connect() {
        if (null !== this.api) {
            return true;
        }

        this.api = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri: process.env.SPTOFIY_CALLBACK_ENDPOINT
        });

        this.setAccessToken(process.env.SPOTIFY_ACCESS_TOKEN);
        this.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);

        try {
            // Retrieve an access token
            const token = await this.api.clientCredentialsGrant();
            this.api.setAccessToken(token.body.access_token); //
        } catch(err) {
            logger.error({
                error: 'Something went wrong when retrieving an access token',
                message: err,
            });
        }
    }


    async auth(code, error, res) {

        if (error) {
            logger.error({
                error: 'Callback Error',
                message: error,
            });

            res.send(`Callback Error: ${error}`);
            return;
        }

        try {
            const authorizationCode = await this.api.authorizationCodeGrant(code);

            if (authorizationCode.body.expires_in < 1500) {
                logger.info({method: 'authorizationCode', message: 'Too short, renewing...'});
                authorizationCode = await this.api.refreshAccessToken();
            }

            const accessToken = authorizationCode.body.access_token;
            const refreshToken = authorizationCode.body.refresh_token;
            const expiresIn = authorizationCode.body.expires_in;

            this.setAccessToken(accessToken);
            this.setRefreshToken(refreshToken);

            logger.info({
                method: 'auth',
                access_token: accessToken,
                refresh_token: refreshToken,
                message: `Sucessfully retreived access token. Expires in ${expiresIn} s.`
            });

            res.send('Success! You can now close the window.');

            setInterval(async () => {
                const token = await this.api.refreshAccessToken();
                const accessToken = token.body.access_token;

                this.setAccessToken(accessToken);

                logger.info({
                    method: 'auth',
                    access_token: accessToken,
                    message: 'The access token has been refreshed!',
                });

            }, expiresIn / 2 * 1000);

        } catch (err) {
            logger.error({
                method: 'auth',
                error: 'Error getting Tokens',
                message: err,
            });

            res.send(`Error getting Tokens: ${err}`);
        }
    }


    setAccessToken(accessToken) {
        return this.api.setAccessToken(accessToken);
    }


    setRefreshToken(refreshToken) {
        return this.api.setRefreshToken(refreshToken);
    }


    createAuthorizeURL() {
        return this.api.createAuthorizeURL(scopes, 'new');
    }

    
    async refreshAccessToken() {
        let token = {};
        
        try {
            token = await this.api.refreshAccessToken();

            // Save the access token so that it's used in future calls
            this.api.setAccessToken(token.body.access_token);

            logger.info({
                method: 'refreshAccessToken',
                message: 'The access token has been refreshed!',
            });
        } catch (err) {
            logger.error({
                error: 'Could not refresh access token',
                message: err,
            });
        }
        
        return token;
    }


    async searchTracks(q, limit = 1) {
        try {
            const searchTracks = await this.api.searchTracks(q, {
                limit,
            });

            return searchTracks.body;
        } catch (err) {
            logger.error({
                error: 'Search failed',
                query: q,
                message: err,
            });
        }
    }


    async addTracksToPlaylist(playlistID, listOfTracks = [], position = 0, handleDuplicates = true) {
        if (true === handleDuplicates) {
            let trackFromPlaylist = await this.findTrackInPlaylist(listOfTracks[0], playlistID);

            // unique only, skip
            if (-1 !== trackFromPlaylist) {
                // already first, check position
                if (0 < trackFromPlaylist.position) {
                    await this.reorderTracksInPlaylist(playlistID, 1, trackFromPlaylist.position, 0);
                    logger.debug({
                        playlistID,
                        description: 'Track already exists, bumping to be first',
                        trackPosition: trackFromPlaylist.position,
                        id: listOfTracks[0],
                        name: trackFromPlaylist.name,
                    });
                } else {
                    logger.debug({
                        playlistID,
                        description: 'Track already exists and first in playlist - SKIPPING!',
                        id: listOfTracks[0],
                        name: trackFromPlaylist.name
                    });
                }

                return true;
            }

        }

        logger.info({
            playlistID,
            description: 'ADDING THE FOLLOWING TRACK TO LIST',
            trackIDs: listOfTracks,
        });

        try {
            const playlist = await this.api.addTracksToPlaylist(playlistID, listOfTracks, {
                    position
                });
            return true;
        } catch (err) {
            logger.error({
                method: 'addTracksToPlaylist',
                description: 'Failed to add track to playlist',
                playlistID,
                message: err,
            });
        }
    }


    async findTrackInPlaylist(trackID, playlistID) {
        let playlistTracks = await this.getPlaylistTracksAllPages(playlistID);
        let uriTracks = this._extractUriFromTracks(playlistTracks);
        
        return (undefined !== uriTracks[trackID]) ? uriTracks[trackID] : - 1;
    }


    // getter for the playlist tracks
    async getPlaylistTracks(playlistID, limit = 100, offset = 0, fields = 'tracks(offset,total,items(track(uri,name)))') {
        try {
            const playlist = await this.api.getPlaylistTracks(playlistID, {
                    offset,
                    limit,
                    fields,
                });

            return playlist.body;
        } catch(err) {
            logger.info({
                playlistID,
                method: 'getPlaylistTracks',
                error: 'Something went wrong!',
                message: err,
            });
        }
    }


    // getter for the playlist tracks
    async getPlaylistTracksAllPages(playlistID, limit = 100, offset = 0, fields = 'limit,offset,total,items(track(uri,name))') {

        let firstPage = await this.getPlaylistTracks(playlistID, limit, offset, fields);
        let totalPages = Math.ceil((firstPage.total || 1) / limit);
        
        let allPagesPromise = Array.from(new Array(totalPages-1), (_, index) => index+1).map(
            pageNumber => this.getPlaylistTracks(playlistID, limit, limit * pageNumber, fields)
                .catch(
                    (err) => logger.error({
                        method: 'getPlaylistAllPages',
                        args: [...arguments],
                        error: 'paged request failed',
                        message: err
                    })
                )
        );

        return await Promise.all(allPagesPromise)
            .then((playlists) => {
                playlists.forEach((playlist, idx) => {
                    firstPage.items.push(...playlist.items);
                });

                return firstPage;
            }).catch(
                (err) => {
                    // there was an error
                    logger.error({
                        playlistID,
                        method: 'getPlaylistAllPages',
                        error: 'Global fetch failed',
                        message: err,
                    });
                })
    }


    // re-order a a track in a list
    async reorderTracksInPlaylist(playlistID, rangeLength = 1, rangeStart = 0, insertBefore = 0) {
        let options = {
            range_length: rangeLength
        };

        try {
            const playlist = await this.api.reorderTracksInPlaylist(playlistID, rangeStart, insertBefore, options);
            return playlist.body;
        } catch (err) {
            logger.error({
                playlistID,
                method: 'reorderTracksInPlaylist',
                error: 'Something went wrong!',
                message: err,
            });
        }
    }


    // replace complete list of tracks (override?)
    async replaceTracksInPlaylist(playlistID, tracksList = []) {
        try {
            const playlist = await this.api.replaceTracksInPlaylist(playlistID, tracksList);

            logger.debug({
                playlistID,
                method: 'replaceTracksInPlaylist',
                description: 'Replaced playlist, snapshot',
                message: playlist.body,
            });

            return playlist.body;
        } catch (err) {
            logger.error({
                playlistID,
                method: 'replaceTracksInPlaylist',
                error: 'Something went wrong!',
                message: err,
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


    async playlistUpdateDetails(playlistID, props = {}) {
        try {
            const playlist = await this.api.changePlaylistDetails(playlistID, {
                    ...props
                });

                logger.info({
                    method: 'playlistUpdateDetails',
                    description: 'Playlist details updated.',
                    playlistID,
                    message: data.body
                });

                return data.body;
        } catch (err) {
            logger.error({
                method: 'playlistUpdateDetails',
                error: 'Something went wrong!',
                playlistID,
                message: err,
            });
        }
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
