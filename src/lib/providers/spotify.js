import SpotifyWebApi from 'spotify-web-api-node';

import logger from '../../utils/logger.js';

const scopes = [
        'user-top-read',
        'playlist-read-private',
        'playlist-modify-private',
        'playlist-modify-public'
    ];

class Spotify {
    constructor() {
        this.api = null;
    }

    async auth(code, error, res) {

        if (error) {
            logger.error({
                error: 'Callback Error',
                message: error
            });

            res.send(`Callback Error: ${error}`);
            return;
        }

        this.api
            .authorizationCodeGrant(code)
            .then(async data => {
                if (data.body['expires_in'] < 1500) {
                    logger.info({method: '[authorizationCodeGrant]', message: 'Too short, renewing...'});
                    const data = await this.api.refreshAccessToken();
                }

                const accessToken = data.body['access_token'];
                const refreshToken = data.body['refresh_token'];
                const expiresIn = data.body['expires_in'];

                this.setAccessToken(accessToken);
                this.setRefreshToken(refreshToken);

                logger.info({method: 'auth', 'access_token': accessToken});
                logger.info({method: 'auth', 'refresh_token': refreshToken});

                logger.info({method: 'auth', message: `Sucessfully retreived access token. Expires in ${expiresIn} s.`});
                res.send('Success! You can now close the window.');

                setInterval(async () => {
                    const data = await this.api.refreshAccessToken();
                    const accessToken = data.body['access_token'];

                    logger.info({method: 'auth', message: 'The access token has been refreshed!'});
                    logger.info({method: 'auth', 'access_token': accessToken});
                    this.setAccessToken(accessToken);
                }, expiresIn / 2 * 1000);
            })
            .catch((err) => {
                logger.error({
                    method: 'auth',
                    error: 'Error getting Tokens',
                    message: err
                });

                res.send(`Error getting Tokens: ${err}`);
            });
    }

    setAccessToken(accessToken) {
        return this.api.setAccessToken(accessToken);
    }


    setRefreshToken(refreshToken) {
        return this.api.setRefreshToken(refreshToken);
    }


    createAuthorizeURL() {
        return this.api.createAuthorizeURL(scopes, 'new')
    }

    
    async refreshAccessToken() {
        return this.api.refreshAccessToken()
            .then((data) => {
                logger.info({
                    method: 'refreshAccessToken',
                    message: 'The access token has been refreshed!'
                });

                // Save the access token so that it's used in future calls
                this.api.setAccessToken(data.body['access_token']);
            })
            .catch((err) => {
                logger.error({
                    error: 'Could not refresh access token',
                    message: err
                });
            });
    }

    async connect() {
        return new Promise((resolve, reject) => {
            if (null !== this.api) {
                return resolve();
            }

            this.api = new SpotifyWebApi({
                clientId: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                redirectUri: process.env.SPTOFIY_CALLBACK_ENDPOINT
            });
            
            this.setAccessToken(process.env.SPOTIFY_ACCESS_TOKEN);
            this.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);

            // Retrieve an access token
            this.api.clientCredentialsGrant()
                .then((data) => {
                    this.api.setAccessToken(data.body['access_token']); //
                    resolve(true);
                })
                .catch((err) => {
                    logger.error({
                        error: 'Something went wrong when retrieving an access token',
                        message: err
                    });

                    reject(err);
                });
        });
    }


    async searchTracks(q, limit = 1) {
        return await this.api.searchTracks(q, {
            limit
        })
        .then((data) => {
            return data.body;
        })
        .catch((err) => {
            logger.error({
                error: 'Search failed',
                query: q,
                message: err
            });
        });
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
                        description: 'Track already exists, bumping to be first.',
                        playlistID,
                        trackPosition: trackFromPlaylist.position,
                        id: listOfTracks[0],
                        name: trackFromPlaylist.name
                    });
                } else {
                    logger.debug({
                        description: 'Track already exists and first in playlist - SKIPPING!',
                        playlistID,
                        id: listOfTracks[0],
                        name: trackFromPlaylist.name
                    });
                }

                return true;
            }

        }

        logger.info({description: 'ADDING THE FOLLOWING TRACK TO LIST:', trackID: listOfTracks});

        return await this.api.addTracksToPlaylist(playlistID, listOfTracks, {
                position
            })
            .then((data) => {
                let body = data.body;

                return true;
            })
            .catch((err) => {
                logger.error({
                    method: 'addTracksToPlaylist',
                    description: 'Failed to add track to playlist',
                    playlistID,
                    message: err
                });
            });
    }


    async findTrackInPlaylist(trackID, playlistID) {
        let playlistTracks = await this.getPlaylistTracksAllPages(playlistID);
        let uriTracks = this._extractUriFromTracks(playlistTracks);
        
        return (undefined !== uriTracks[trackID]) ? uriTracks[trackID] : - 1;
    }


    // getter for the playlist tracks
    async getPlaylistTracks(playlistID, limit = 100, offset = 0, fields = 'tracks(offset,total,items(track(uri,name)))') {
        return await this.api
            .getPlaylistTracks(playlistID, {
                offset,
                limit,
                fields
            })
            .then((data) => {
                return data.body;
            })
            .catch(
                (err) => {
                    logger.info({
                        method: 'getPlaylistTracks',
                        error: 'Something went wrong!',
                        message: err
                    });
                });

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
                        method: 'getPlaylistAllPages',
                        playlistID,
                        error: 'Global fetch failed',
                        message: err
                    });
                })
    }


    // re-order a a track in a list
    async reorderTracksInPlaylist(playlistID, rangeLength = 1, rangeStart = 0, insertBefore = 0) {
        let options = {
            range_length: rangeLength
        };

        return await this.api
            .reorderTracksInPlaylist(playlistID, rangeStart, insertBefore, options)
            .then((data) => {
                return data.body;
            })
            .catch((err) => {
                logger.error({
                    method: 'reorderTracksInPlaylist',
                    playlistID,
                    error: 'Something went wrong!',
                    message: err
                });
            });
    }


    // replace complete list of tracks
    async replaceTracksInPlaylist(playlistID, tracksList = []) {
        return await this.api
            .replaceTracksInPlaylist(playlistID, tracksList)
            .then((data) => {
                logger.info({
                    method: 'replaceTracksInPlaylist',
                    playlistID,
                    description: 'Replaced playlist, snapshot:',
                    message: data.body
                });

                return data.body;
            })
            .catch((err) => {
                logger.error({
                    method: 'replaceTracksInPlaylist',
                    playlistID,
                    error: 'Something went wrong!',
                    message: err
                });
            });
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
        return await this.api
            .changePlaylistDetails(playlistID, {
                ...props
            })
            .then((data) => {
                logger.info({
                    method: 'playlistUpdateDetails',
                    description: 'Playlist details updated.',
                    playlistID,
                    message: data.body
                });

                return data.body;
            })
            .catch((err) => {
                logger.error({
                    method: 'playlistUpdateDetails',
                    error: 'Something went wrong!',
                    playlistID,
                    message: err
                });
            });
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
