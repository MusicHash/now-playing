import MySQLWrapper from '../../utils/mysql_wrapper.js';
import { cleanNames } from '../../utils/strings.js';
import eventEmitterWrapper from '../../utils/event_emitter_wrapper.js';
import { existsInArray } from '../../utils/array.js';
import { SYSTEM_EVENTS } from '../../constants/events.js';
import Spotify from '../providers/spotify.js';


/**
 * TrackLogger
 */
class StationLogger {
    logger;
    blacklistTracks = [
        '9.7 NOW',
        '#1 For All The Hits',
        'Listen On Your Phone',
        '97 NOW App',
        'Injured? Call',
        'Sweet James',
        'SXM App',
        'SiriusXMHits1',
        'Mack & Jen',
        '4871'
    ];


    constructor(Logger) {
        this.logger = Logger;
    }


    init() {
        this.logger.info('StationLogger Initialized');
        this._subscriptions();
    }


    _subscriptions() {
        this._onTrackUpdated();
    }

    
    _onTrackUpdated() {
        eventEmitterWrapper.on(SYSTEM_EVENTS.ON_STATION_TRACK_UPDATED, async (payload) => {
            await this._logTrack(payload.station, payload.result);
        });
    }
    

    async _logTrack(station, tracks) {
        const title = tracks?.fields[0]?.title || '';
        const artist = tracks?.fields[0]?.artist || '';

        const searchQuery = cleanNames([artist, title].join(' '));

        if ('' === searchQuery) {
            this.logger.warn(`Empty search query for STATION '${station}', skipping.`);
            return;
        }

        if ('' === artist || '' === title) {
            this.logger.warn(`Invalid entry for STATION '${station}' | ARTIST: '${artist}' or TITLE: '${title}' or blacklisted item. Probably an commercial, skipping.`);
            return;
        }

        if (
            existsInArray(artist, this.blacklistTracks) ||
            existsInArray(title, this.blacklistTracks)
        ) {
            this.logger.warn(`Invalid blacklisted TITLE '${title}' or ARTIST '${artist}' found in STATION '${station}'. Probably a commercial, skipping.`);
            return;
        }

        this.logger.info(`QUERY: ${searchQuery}`);

        let search = await Spotify.searchTracksWithCache(searchQuery);
        const track = search?.tracks?.items[0];

        if (undefined === track?.id) {
            // nothing found, log
            this.logger.error(`_logTrack failed to insert, no track found on station ${station} for query '${searchQuery}', track response ${JSON.stringify(track)}`);
            return false;
        }

        // insert of find an existing spotifyID ref
        const spotifyID = await MySQLWrapper.checkAndInsert(
            'nowplaying_spotify_tracks',
            'spotify_id',
            {
                'spotify_track_id': track.id
            },
            {
                'spotify_track_id': track.id,
                'spotify_track_title': track.name,
                'spotify_artist_id': track?.artists[0]?.id,
                'spotify_artist_title': track?.artists[0]?.name,
                'spotify_duration_ms': track.duration_ms,
                'spotify_popularity': track.popularity,
                'spotify_timestamp_added': Math.floor(new Date().getTime() / 1000),
            }
        );

        // insert new entry to LOG
        const logID = await MySQLWrapper.insert('nowplaying_station_log', {
            'spotify_id': spotifyID,
            'log_station_id': station,
            'log_artist': tracks?.fields[0]?.artist || '',
            'log_title': tracks?.fields[0]?.title || '',
            'log_timestamp_played': Math.floor(new Date().getTime() / 1000),
        });


        this.logger.info(`ADDED NEW SONG (${logID}) TO STATION '${station}' for QUERY '${searchQuery}', SPOTIFY data | LOCAL_SPOTIFY_ID: '${spotifyID}', SONG: '${track?.artists[0]?.name} - ${track.name}' | SPOTIFY_TRACK_ID: '${track.id}'`);
    }



}


export default StationLogger;
