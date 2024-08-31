import Spotify from './providers/spotify.js';
import { decodeHTMLEntities, cleanNames } from '../utils/strings.js';
import { SYSTEM_EVENTS } from '../constants/events.js';
import eventEmitterWrapper from '../utils/event_emitter_wrapper.js';
import { now } from '../utils/time.js';
import { stations, charts } from '../../config/sources.js';

import logger from '../utils/logger.js';

const subscriptions = function() {
    eventEmitterWrapper.on(SYSTEM_EVENTS.ON_STATION_TRACK_UPDATED, (props) => {
        //await updatePlayList(station, tracks);
    });
};

const updatePlayList = async function (playlist, tracks, firstSongOnly) {
    logger.debug({
        method: 'updatePlayList',
        message: 'Starting playlist update flow',
        metadata: {
            args: [...arguments],
        },
    });

    let playlistID = _getPlaylistID(playlist),
        artist = tracks.fields[0]?.artist || '',
        title = tracks.fields[0]?.title || '';

    let query = cleanNames([artist, title].join(' '));

    // validate min length
    if (9 >= query.length) {
        logger.warn({
            method: 'updatePlayList',
            message: 'Minimum length is below threshold, skipping spotify api call',
            metadata: {
                args: [...arguments],
                playlistID,
                query,
            },
        });

        return Promise.reject();
    }

    try {
        let search = await Spotify.searchTracksWithCache(query);

        if (0 < search.tracks.items.length) {
            let songID = search.tracks.items[0].uri;

            logger.debug({
                method: 'updatePlayList',
                message: 'Found track, takes first',
                metadata: {
                    args: [...arguments],
                    playlistID,
                    songID,
                    query,
                    search,
                },
            });

            let addToPlaylist = await Spotify.addTracksToPlaylist(playlistID, [songID], 0);
            await updatePlaylistMetadata(playlist);
        } else {
            logger.debug({
                method: 'updatePlayList',
                message: 'Track was not found, playlist didnt update',
                metadata: {
                    args: [...arguments],
                    query,
                    playlistID,
                },
            });
        }
    } catch (error) {
        logger.error({
            method: 'updatePlayList',
            message: 'updatePlayList failed, exception',
            error,
            metadata: {
                args: [...arguments],
                query,
                playlistID,
            },
        });
    }
};

const replacePlayList = async function (playlist, tracks) {
    logger.debug({
        method: 'replacePlayList',
        message: 'Starting to replace all tracks in a given playlist',
        metadata: {
            args: [...arguments],
        },
    });

    let playlistID = _getPlaylistID(playlist);

    let extractURI = async function (query) {
        let search = await Spotify.searchTracksWithCache(query);

        if (0 < search.tracks.items.length) {
            let songID = search.tracks.items[0].uri;

            logger.debug({
                method: 'extractURI -> replacePlayList',
                message: 'Found a track for query',
                metadata: {
                    args: [...arguments],
                    playlistID,
                    query,
                    songID,
                },
            });

            return songID;
        } else {
            // retry here ?

            logger.debug({
                method: 'extractURI -> replacePlayList',
                message: 'Track not found for query',
                metadata: {
                    args: [...arguments],
                    playlistID,
                    query,
                },
            });
        }

        return null;
    };

    let tracksList = [];

    try {
        for (let i = 0, len = tracks.fields.length; i < len; i++) {
            let artist = (tracks.fields[i] && tracks.fields[i].artist) || '',
                title = (tracks.fields[i] && tracks.fields[i].title) || '';

            let query = cleanNames([artist, title].join(' '));
            let tracksFound = await extractURI(query);

            if (null !== tracksFound) {
                tracksList.push(tracksFound);
            } else {
                // @todo: decide what to do here: skip?retry?
                logger.debug({
                    method: 'replacePlayList',
                    message: 'tracksFound request failed, not tracks found',
                    metadata: {
                        args: [...arguments],
                        playlistID,
                        query,
                        tracksFound,
                        tracksList,
                    },
                });
            }
        }

        let replaceItemsInPlaylist = await Spotify.replaceTracksInPlaylist(playlistID, tracksList);
        await updatePlaylistMetadata(playlist);
    } catch (error) {
        logger.error({
            message: 'replacePlayList failed',
            error,
            metadata: {
                args: [...arguments],
                playlistID,
            },
        });
    }
};

const updatePlaylistMetadata = async function (playlist) {
    let playlistID = _getPlaylistID(playlist);
    let nowPlayingMetadata = _getNowPlayingMetadata(playlist);

    try {
        let metadata = {
            name: (_getPlaylistPrefix() + ' ' + nowPlayingMetadata.title).trim(),
            description: nowPlayingMetadata.description.replace('{now}', now()),
            public: _getPlaylistIsPublic(),
        };

        await Spotify.playlistUpdateMetadata(playlistID, metadata);
    } catch (error) {
        logger.error({
            method: 'updatePlaylistMetadata',
            message: 'updatePlaylistMetadata failed',
            error,
            metadata: {
                args: [...arguments],
            },
        });
    }
};

const slicePlaylist = async function (playlist, limit) {
    let playlistID = _getPlaylistID(playlist);

    try {
        await updatePlaylistMetadata(playlist);
        await Spotify.slicePlaylist(playlistID, limit);
    } catch (error) {
        logger.error({
            method: 'slicePlaylist',
            message: 'slicePlaylist exception',
            error,
            metadata: {
                args: [...arguments],
            },
        });
    }
};

const sliceAllPlaylists = async function (limit = 200) {
    let delaySeconds = 5,
        chartEnumeration = 1;

    for (let station in stations) {
        let delayBySeconds = delaySeconds * chartEnumeration;

        setTimeout(() => {
            slicePlaylist(station, limit);
        }, delayBySeconds * 1000);

        logger.debug({
            args: [...arguments],
            message: `Queued station ${station} for slice in ${delayBySeconds}s`,
        });

        chartEnumeration++;
    }
};

const _getNowPlayingMetadata = function (channelID) {
    let channels = Object.assign({}, stations, charts);

    return channels[channelID]?.now_playing;
};

const _getPlaylistID = function (source) {
    let playlists = JSON.parse(process.env.SPOTIFY_PLAYLIST_MAP);

    return playlists[source];
};

const _getPlaylistPrefix = function () {
    return process.env.SPOTIFY_PLAYLIST_PREFIX || '';
};

const _getPlaylistIsPublic = function () {
    let isPublic = process.env.SPOTIFY_PLAYLIST_IS_PUBLIC || false;

    return (process.env.SPOTIFY_PLAYLIST_IS_PUBLIC === 'true') || false;
};

const isProduction = function () {
    return ['production'].includes(process.env.NODE_ENV);
};


export { updatePlayList, replacePlayList, slicePlaylist, sliceAllPlaylists, subscriptions, _getPlaylistID };
