const Spotify = require('./providers/spotify');
const { decodeHTMLEntities } = require('../utils/strings');
const { stations } = require('../../config/sources');

const updatePlayList = async function (playlist, tracks, firstSongOnly) {
    console.debug(['START updatePlayList', playlist, tracks])

    let playlistID = _getPlaylistID(playlist),
        artist = tracks.fields[0] && tracks.fields[0].artist || '',
        title = tracks.fields[0] && tracks.fields[0].title || '';

    let q = _cleanNames(decodeHTMLEntities([artist, title].join(' - ')));

    try {
        let search = await Spotify.searchTracks(q);

        if (0 < search.tracks.items.length) {
            let songID = search.tracks.items[0].uri;

            console.debug(['FOUND, adding', q, playlist])

            let addToPlaylist = await Spotify.addTracksToPlaylist(playlistID, [songID], 0);
            await updatePlaylistDescription(playlistID);
        } else {
            console.debug(['END - NOT FOUND', q, playlist, tracks])
        }
    } catch (e) {
        console.error(['updatePlayList exception', e]);
    }
};


const replacePlayList = async function (playlist, tracks) {
    console.debug(['START replacePlayList', playlist, tracks])

    let playlistID = _getPlaylistID(playlist);

    let extractURI = async function(q) {
        let search = await Spotify.searchTracks(q);

        if (0 < search.tracks.items.length) {
            let songID = search.tracks.items[0].uri;

            //console.debug(['[replacePlayList]', 'FOUND item for q: ', q, songID]);

            return songID;
        } else {
            console.debug(['[replacePlayList]', 'NOT FOUND', q]);
            // ? retry?
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
                // skip?
                // ? retry?
            }
            
            
        }

        let replaceItemsInPlaylist = await Spotify.replaceTracksInPlaylist(playlistID, tracksList);
        await updatePlaylistDescription(playlistID);
    } catch (e) {
        console.error(['replacePlayList exception', e]);
    }
};

const updatePlaylistDescription = async function (playlistID) {
    try {
        await Spotify.playlistUpdateDetails(playlistID, {
            description: 'Last 200 Tracks. LAST UPDATE: {now}'.replace('{now}', _now())
        });
    } catch (e) {
        console.error(['updatePlaylistDescription exception', e]);
    }
};


const slicePlaylist = async function (playlist, limit) {
    let playlistID = _getPlaylistID(playlist);

    try {
        await updatePlaylistDescription(playlistID);
        await Spotify.slicePlaylist(playlistID, limit);
    } catch (e) {
        console.error(['slicePlaylist exception', e]);
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

        console.debug(`Queued station ${stationIdx} for slice in ${delayBySeconds}s`);

        chartEnumeration++;
    }
};


const _getPlaylistID = function(source) {
    let playlists = JSON.parse(process.env.SPOTIFY_PLAYLIST_MAP);

    return playlists[source];
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


module.exports = {
    updatePlayList,
    replacePlayList,
    slicePlaylist,
    sliceAllPlaylists,
};

