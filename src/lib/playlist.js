const Spotify = require('./providers/spotify');
const { decodeHTMLEntities } = require('../utils/strings');

const updatePlayList = async function (playlist, tracks, firstSongOnly) {
    console.debug(['START updatePlayList', playlist, tracks])

    let playlistID = _getPlaylistID(playlist),
        artist = tracks.fields[0] && tracks.fields[0].artist || '',
        title = tracks.fields[0] && tracks.fields[0].title || '';

    let q = _cleanNames(decodeHTMLEntities([artist, title].join(' - ')));
    let search = await Spotify.searchTracks(q);

    if (0 < search.tracks.items.length) {
        let songID = search.tracks.items[0].uri;

        console.debug(['FOUND, adding', q, playlist])

        let addToPlaylist = await Spotify.addTracksToPlaylist(playlistID, [songID], 0);
    } else {
        console.debug(['END - NOT FOUND', q, playlist, tracks])
    }
    
};


const replacePlayList = async function (playlist, tracks) {
    console.debug(['START replacePlayList', playlist, tracks])

    let playlistID = _getPlaylistID(playlist);

    let extractURI = async function(q) {
        let search = await Spotify.searchTracks(q);

        if (0 < search.tracks.items.length) {
            let songID = search.tracks.items[0].uri;

            console.debug(['[replacePlayList]', 'FOUND item for q: ', q, songID]);

            return songID;
        } else {
            console.debug(['[replacePlayList]', 'NOT FOUND', q]);
            // ? retry?
        }

        return null;
    };

    let tracksList = [];

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

};

const _getPlaylistID = function(source) {
    let playlists = JSON.parse(process.env.SPOTIFY_PLAYLIST_MAP);

    return playlists[source];
};


const _cleanNames = function(str) {
    return str
        .replace(/\s\([^)]+\)$/, '') // removes, last part (.*)$
        .replace(/-/g, ' ')    
        .replace(/(\/)/g, ' ')
        .replace(/\s+/g, ' ');
};

module.exports = {
    updatePlayList,
    replacePlayList
};
