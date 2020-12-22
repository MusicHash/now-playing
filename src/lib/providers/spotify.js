const SpotifyWebApi = require('spotify-web-api-node');

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
            console.error('Callback Error:', error);
            res.send(`Callback Error: ${error}`);
            return;
        }

        this.api
            .authorizationCodeGrant(code)
            .then(async data => {
                if (data.body['expires_in'] < 1500) {
                    console.info('[authorizationCodeGrant] Too short, renewing...');
                    const data = await this.api.refreshAccessToken();
                }

                const accessToken = data.body['access_token'];
                const refreshToken = data.body['refresh_token'];
                const expiresIn = data.body['expires_in'];

                this.setAccessToken(accessToken);
                this.setRefreshToken(refreshToken);

                console.log('access_token:', accessToken);
                console.log('refresh_token:', refreshToken);

                console.log(`Sucessfully retreived access token. Expires in ${expiresIn} s.`);
                res.send('Success! You can now close the window. <a href="/spotify/login">Re-login!</a>');

                setInterval(async () => {
                    const data = await this.api.refreshAccessToken();
                    const accessToken = data.body['access_token'];

                    console.log('The access token has been refreshed!');
                    console.log('access_token:', accessToken);
                    this.setAccessToken(accessToken);
                }, expiresIn / 2 * 1000);
            })
            .catch((err) => {
                console.error('Error getting Tokens:', err);
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
                console.log('The access token has been refreshed!');

                // Save the access token so that it's used in future calls
                this.api.setAccessToken(data.body['access_token']);
            })
            .catch((err) => {
                console.log('Could not refresh access token', err);
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
                    console.error('Something went wrong when retrieving an access token', error);
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
            console.error(err);
        });
    }


    async addTracksToPlaylist(playlistID, listOfTracks = [], position = 0) {
        let trackFromPlaylist = await this.findTrackInPlaylist(listOfTracks[0], playlistID);

        // unique only, skip
        if (-1 !== trackFromPlaylist) {
            // already first, check position
            if (0 < trackFromPlaylist.position) {
                await this.reorderTracksInPlaylist(playlistID, 1, trackFromPlaylist.position, 0);
                console.debug(['Track already exists, bumping to be first.', playlistID, trackFromPlaylist.position, listOfTracks[0], trackFromPlaylist.name]);
            } else {
                console.debug(['Track already exists and first in playlist - SKIPPING!', playlistID, listOfTracks[0], trackFromPlaylist.name]);
            }
            
            return true;
        }

        return await this.api.addTracksToPlaylist(playlistID, listOfTracks, {
                position
            })
            .then((data) => {
                let body = data.body;

                return true;
            })
            .catch((err) => {
                console.error(err);
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
            .catch((err) => {
                console.log('[getPlaylistTracks] Something went wrong!', err);
            });

    }


    // getter for the playlist tracks
    async getPlaylistTracksAllPages(playlistID, limit = 100, offset = 0, fields = 'limit,offset,total,items(track(uri,name))') {
        let firstPage = await this.getPlaylistTracks(playlistID, limit, offset, fields);
        let totalPages = Math.ceil(firstPage.total / limit);
        
        let allPagesPromise = Array.from(new Array(totalPages-1), (_, index) => index+1).map(
            pageNumber => this.getPlaylistTracks(playlistID, limit, limit * pageNumber, fields)
                .catch(
                    (err) => console.error('[getPlaylistAllPages] paged request failed.', err)
                )
        );

        return await Promise.all(allPagesPromise)
            .then((playlists) => {
                playlists.forEach((playlist, idx) => {
                    firstPage.items.push(...playlist.items);
                });

                return firstPage;
            }).catch((err) => {
                // there was an error
                console.error('[getPlaylistAllPages] Global fetch failed', err);
            });
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
                console.log('[reorderTracksInPlaylist] Something went wrong!', err);
            });
    }


    // replace complete list of tracks
    async replaceTracksInPlaylist(playlistID, tracksList = []) {
        return await this.api
            .replaceTracksInPlaylist(playlistID, tracksList)
            .then((data) => {
                console.log(['[replaceTracksInPlaylist]', 'Replaced playlist, snapshot:', data.body]);
                return data.body;
            })
            .catch((err) => {
                console.log('[reorderTracksInPlaylist] Something went wrong!', err);
            });
    }


    // replace complete list of tracks
    async slicePlaylist(playlistID, limit = 100) {
        let playlist = await this.getPlaylistTracksAllPages(playlistID, limit);
        let tracksList = playlist.items.map((item) => item.track.uri);
        
        tracksList = tracksList.splice(0, limit);

        return await this.replaceTracksInPlaylist(playlistID, tracksList);
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

module.exports = new Spotify();