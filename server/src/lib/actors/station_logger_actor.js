import MySQLWrapper from '../../utils/mysql_wrapper.js';
import { cleanNames } from '../../utils/strings.js';
import eventEmitterWrapper from '../../utils/event_emitter_wrapper.js';
import { existsInArray } from '../../utils/array.js';
import { SYSTEM_EVENTS } from '../../constants/events.js';
import Spotify from '../providers/spotify.js';
import { isrcFromSpotifyTrack } from '../spotify_track_isrc.js';
import { releaseDateYmdFromSpotifyTrack } from '../spotify_track_release_date.js';
import { resolveCanonicalSpotifyId, spotifyTrackDuplicateCheckParams } from '../spotify_track_canonical.js';


/**
 * StationLoggerActor
 */
class StationLoggerActor {
    logger;
    blacklistTracks = [
        '#1 For All The Hits',
        'Listen On Your Phone',
        '97 NOW App',
        '997NOW',
        'PayYourBills',
        'Hurricane Relief',
        'Win $1000 Cash',
        'Red Cross Wildfire Relief',
        'Want Your Message Here',
        'CLUB 997',
        '9.7 NOW',
        'Injured? Call',
        'Sweet James',
        'SXM App',
        'Pulse Top',
        'Verified with',
        '$1000 Pay Your Bills',
        'Hourly Weekdays',
        'SXMThePulse',
        'SirriusXMHits1',
        'MorningMashUp',
        '10s on 10s Countdown',
        'SiriusXM',
        'siriusxm',
        'alexditrolio',
        'Be A Hit-Maker',
        'Tony Fly & Symon',
        'bradyonair',
        'MikeyPiff',
        'Barbie Ferreira',
        'benharlum',
        'DavisBurleson',
        'SpyderHarrison',
        'WeekendCountdown',
        'Mack & Jen',
        'לייב בגלגלצ',
        '4871'
    ];


    constructor(Logger) {
        this.logger = Logger;
    }


    init() {
        this.logger.info('StationLoggerActor Initialized');
        this._subscriptions();
    }


    _subscriptions() {
        this._onTrackUpdated();
    }

    
    _onTrackUpdated() {
        eventEmitterWrapper.on(SYSTEM_EVENTS.ON_STATION_TRACK_UPDATED, async (payload) => {
            try {
                await this._logTrack(payload.station, payload.result);
            } catch (error) {
                this.logger.error({
                    method: '_onTrackUpdated',
                    message: 'Error logging track update',
                    error,
                    metadata: {
                        station: payload.station,
                        resultKeys: payload.result ? Object.keys(payload.result) : 'no result'
                    }
                });
                // Don't re-throw to prevent cascading failures
            }
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

        try {
            let search = await Spotify.searchTracksWithCache(searchQuery);
            const track = search?.tracks?.items[0];

            if (undefined === track?.id) {
                // nothing found, log
                this.logger.warn(`_logTrack failed to insert, no track found on station ${station} for query '${searchQuery}'`);
                return false;
            }

            const isrc = isrcFromSpotifyTrack(track) ?? null;
            const releaseDateYmd = releaseDateYmdFromSpotifyTrack(track) ?? null;

            const spotifyIdRow = await MySQLWrapper.checkAndInsert(
                'nowplaying_spotify_tracks',
                'spotify_id',
                spotifyTrackDuplicateCheckParams(track.id, isrc),
                {
                    spotify_track_id: track.id,
                    spotify_artist_id: track?.artists[0]?.id,
                    spotify_isrc: isrc,
                    spotify_release_date: releaseDateYmd,
                    spotify_artist_title: track?.artists[0]?.name,
                    spotify_track_title: track.name,
                    spotify_duration_ms: track.duration_ms,
                    spotify_popularity: track.popularity,
                    spotify_timestamp_added: Math.floor(new Date().getTime() / 1000),
                },
            );

            const spotifyID = await resolveCanonicalSpotifyId(MySQLWrapper, spotifyIdRow, isrc);

            // insert new entry to LOG
            const logID = await MySQLWrapper.insert('nowplaying_station_log', {
                'spotify_id': spotifyID,
                'log_station_id': station,
                'log_artist': tracks?.fields[0]?.artist || '',
                'log_title': tracks?.fields[0]?.title || '',
                'log_timestamp_played': Math.floor(new Date().getTime() / 1000),
            });

            this.logger.info(`ADDED NEW SONG (${logID}) TO STATION '${station}' for QUERY '${searchQuery}', SPOTIFY data | LOCAL_SPOTIFY_ID: '${spotifyID}', SONG: '${track?.artists[0]?.name} - ${track.name}' | SPOTIFY_TRACK_ID: '${track.id}'`);
        } catch (error) {
            this.logger.error({
                method: '_logTrack',
                message: 'Failed to log track to database',
                error,
                metadata: {
                    station,
                    searchQuery,
                    artist: tracks?.fields[0]?.artist,
                    title: tracks?.fields[0]?.title
                }
            });
            throw error; // Re-throw so the event emitter wrapper can catch it
        }
    }



}


export default StationLoggerActor;
