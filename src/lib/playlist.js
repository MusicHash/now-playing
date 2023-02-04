import Spotify from './providers/spotify.js';
import { decodeHTMLEntities } from '../utils/strings.js';
import { stations, charts } from '../../config/sources.js';

import logger from '../utils/logger.js';


const updatePlayList = async function (playlist, tracks, firstSongOnly) {
    logger.debug({
        method: 'updatePlayList',
        message: 'START',
        metadata: {
            playlist,
            tracks,
        },
    });

    let playlistID = _getPlaylistID(playlist),
        artist = tracks.fields[0] && tracks.fields[0].artist || '',
        title = tracks.fields[0] && tracks.fields[0].title || '';

    let q = _cleanNames(decodeHTMLEntities([artist, title].join(' - ')));

    try {
        let search = await Spotify.searchTracks(q);

        if (0 < search.tracks.items.length) {
            let songID = search.tracks.items[0].uri;

            logger.debug({
                method: 'updatePlayList',
                message: 'FOUND, adding',
                metadata: {
                    query: q,
                    playlist,
                    playlistID,
                }
            });

            let addToPlaylist = await Spotify.addTracksToPlaylist(playlistID, [songID], 0);
            await updatePlaylistMetadata(playlist);
        } else {
            logger.debug({
                method: 'updatePlayList',
                message: 'END - NOT FOUND',
                metadata: {
                    query: q,
                    playlist,
                    playlistID,
                    tracks,
                }
            });
        }
    } catch (err) {
        logger.error({
            error: 'updatePlayList failed, exception',
            message: err,
            metadata: {
                query: q,
                playlist,
                playlistID,
                tracks,
            }
        });
    }
};


const replacePlayList = async function (playlist, tracks) {
    logger.debug({
        method: 'replacePlayList',
        message: 'START',
        metadata: {
            playlist,
            tracks,
        },
    });

    let playlistID = _getPlaylistID(playlist);

    let extractURI = async function(q) {
        let search = await Spotify.searchTracks(q);

        if (0 < search.tracks.items.length) {
            let songID = search.tracks.items[0].uri;

            //logger.debug({method: 'replacePlayList', message: 'FOUND item for q', query: q, songID});

            return songID;
        } else {
            // retry here ?

            logger.debug({
                method: 'replacePlayList',
                error: 'NOT FOUND',
                query: q,
            });
        }

        return null;
    };

    let tracksList = [];

    try {
        for (let i = 0, len = tracks.fields.length; i < len; i++) {
            let artist = tracks.fields[i] && tracks.fields[i].artist || '',
                title = tracks.fields[i] && tracks.fields[i].title || '';

            let q = _cleanNames(decodeHTMLEntities([artist, title].join(' - ')));
            let trackFound = await extractURI(q);

            if (null !== trackFound) {
                tracksList.push(trackFound);
            } else {
                // @todo: decide what to do here: skip?retry?
                logger.debug({
                    method: 'replacePlayList',
                    description: 'trackFound not found, could be timeout etc..',
                    trackFound,
                    tracksList,
                });
            }
        }

        let replaceItemsInPlaylist = await Spotify.replaceTracksInPlaylist(playlistID, tracksList);
        await updatePlaylistMetadata(playlist);
    } catch (err) {
        logger.error({
            error: 'replacePlayList exception',
            message: err,
        });
    }
};

const updatePlaylistMetadata = async function (playlist) {
    let playlistID = _getPlaylistID(playlist);
    let nowPlayingMetadata = _getNowPlayingMetadata(playlist);

    try {
        let metadata = {
            name: isProduction() ? nowPlayingMetadata.title : _getPlaylistPrefix() +' '+ nowPlayingMetadata.title,
            description: nowPlayingMetadata.description.replace('{now}', _now()),
            public: isProduction()
        };

        await Spotify.playlistUpdateDetails(playlistID, metadata);
    } catch (err) {
        logger.error({
            error: 'updatePlaylistMetadata exception',
            message: err,
        });
    }
};


const slicePlaylist = async function (playlist, limit) {
    let playlistID = _getPlaylistID(playlist);

    try {
        await updatePlaylistMetadata(playlist);
        await Spotify.slicePlaylist(playlistID, limit);
    } catch (err) {
        logger.error({
            error: 'slicePlaylist exception',
            message: err,
        });
    }
};


const sliceAllPlaylists = async function (limit = 200) {
    let delaySeconds = 5,
        chartEnumeration = 1;

    for (let stationIdx in stations) {

        let delayBySeconds = (delaySeconds * chartEnumeration);

        setTimeout(() => {
            slicePlaylist(stationIdx, limit);
        }, delayBySeconds * 1000);

        logger.debug({
            message: `Queued station ${stationIdx} for slice in ${delayBySeconds}s`,
        });

        chartEnumeration++;
    }
};

const _getNowPlayingMetadata = function(channelID) {
    let channels = Object.assign({}, stations, charts);

    return channels[channelID]?.now_playing;
};

const _getPlaylistID = function(source) {
    let playlists = JSON.parse(process.env.SPOTIFY_PLAYLIST_MAP);

    return playlists[source];
};

const _getPlaylistPrefix = function() {
    return process.env.SPOTIFY_PLAYLIST_PREFIX;
};

const isProduction = function() {
    return (['production'].includes(process.env.NODE_ENV));
};

const _cleanNames = function(str) {
    return str
        .replace(/\s\([^)]+\)$/, '') // removes, last part (.*)$
        .replace(/( עם |feat\.|Ft\.|Featuring)/g, '')
        .replace(/(&|,)/g, '')
        .replace(/( x |-|–)/g, ' ')    
        .replace(/(\/)/g, ' ')
        .replace(/\s+/g, ' ');
};

const _now = function(timezone = 'Asia/Jerusalem') {
    let parts = new Intl.DateTimeFormat('en', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        second: '2-digit',
        timeZone: timezone,
    })
    .formatToParts(new Date())
    .reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, Object.create(null));

    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
};


export {
    updatePlayList,
    replacePlayList,
    slicePlaylist,
    sliceAllPlaylists,
};
