const Spotify = require('./providers/spotify');
const { decodeHTMLEntities } = require('../utils/strings');

const updatePlayList = async function (playlist, tracks) {
    console.debug(['START', playlist, tracks])

    let artist = tracks.fields[0] && tracks.fields[0].artist || '',
        title = tracks.fields[0] && tracks.fields[0].title || '';
    
    let playlistID = _getPlaylistID(playlist);

    let q = _cleanNames(decodeHTMLEntities([artist, title].join(' - ')));

    let search = await Spotify.search(q);

    if (0 < search.tracks.items.length) {
        let songID = search.tracks.items[0].uri;

        console.debug(['FOUND, adding', q, playlist])

        let addToPlaylist = await Spotify.addTracksToPlaylist(playlistID, [songID], 0);
    } else {
        console.debug(['END - NOT FOUND', q, playlist, tracks])
    }
    
};

const _getPlaylistID = function(source) {
    let playlists = JSON.parse(process.env.SPOTIFY_PLAYLIST_MAP);

    return playlists[source];
};


const _cleanNames = function(str) {
    return str
        .replace(/-/g, ' ')    
        .replace(/(\/)/g, ' ')
        .replace(/\s+/g, ' ');
};

module.exports = {
    updatePlayList,
};
