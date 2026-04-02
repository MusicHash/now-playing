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
        this.logger.info('SpotifyActor Initialized');
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

            this.logger.info(`UPDATING SPOTIFY PLAYLIST_ID (${spotifyPlaylistID}) for station ('${stationKey}') | SPOTIFY_TRACKS_LIST: '${spotifyTracksList}'`);

            Spotify.replaceTracksInPlaylist(spotifyPlaylistID, spotifyTracksList);
        });
    }
    




}


export default SpotifyActor;
