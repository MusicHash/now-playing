import { cleanNames } from '../../utils/strings.js';
import eventEmitterWrapper from '../../utils/event_emitter_wrapper.js';
import { SYSTEM_EVENTS } from '../../constants/events.js';
import Spotify from '../providers/spotify.js';


/**
 * SpotifyActor
 */
class SpotifyActor {
    logger;


    constructor(Logger) {
        this.logger = Logger;
    }


    init() {
        this.logger.info({
            method: 'SpotifyActor.init',
            message: 'Actor initialized',
        });
        this._subscriptions();
    }


    _subscriptions() {
        this._onTrackUpdated();
    }

    
    _onTrackUpdated() {
        eventEmitterWrapper.on(SYSTEM_EVENTS.ON_SPOTIFY_PLAYLIST_UPDATE, async (payload) => {
            const stationKey = payload.stationKey;
            const spotifyPlaylistID = payload.spotifyPlaylistID;
            const spotifyTracksList = payload.spotifyTracksList;

            const trackURIs = Array.isArray(spotifyTracksList) ? spotifyTracksList : [];
            this.logger.info({
                method: 'SpotifyActor._onTrackUpdated',
                message: 'Replacing Spotify playlist from station data',
                metadata: {
                    stationID: stationKey,
                    playlistID: spotifyPlaylistID,
                    trackCount: trackURIs.length,
                },
            });

            Spotify.replaceTracksInPlaylist(spotifyPlaylistID, spotifyTracksList);
        });
    }
    




}


export default SpotifyActor;
