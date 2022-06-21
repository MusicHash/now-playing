import Spotify from '../../src/lib/providers/spotify.js';


const PLAYLIST_ID_READONLY = '7zHsH44gcVuASD4nKx9WLE', // [DEV] [CI] TESTING PLAYLING - READ ONLY
      PLAYLIST_ID_READWRITE = '4LBD80j2Bj3QLpXoeS5yq2', // [DEV] [CI] TESTING PLAYLING - READ/WRITE
      PLAYLIST_VALID_LIMIT = 200,
      PLAYLIST_API_LIMIT_PER_PAGE = 100,
      TRACKS = [
        {
            id: 'spotify:track:4JehYebiI9JE8sR8MisGVb',
            artist: 'Beyoncé',
            name: 'Halo',
        },
        {
            id: 'spotify:track:5IVuqXILoxVWvWEPm82Jxr',
            artist: 'Beyoncé',
            name: 'Crazy In Love (feat. Jay-Z)',
        },
        {
            id: 'spotify:track:6jG2YzhxptolDzLHTGLt7S',
            artist: 'Beyoncé',
            name: 'Drunk in Love (feat. Jay-Z)',
        },
        {
            id: 'spotify:track:1z6WtY7X4HQJvzxC4UgkSf',
            artist: 'Beyoncé',
            name: 'Love On Top',
        },
        {
            id: 'spotify:track:5v4GgrXPMghOnBBLmveLac',
            artist: 'Beyoncé',
            name: 'Savage Remix (feat. Beyoncé)',
        },
        {
            id: 'spotify:track:5hgnY0mVcVetszbb85qeDg',
            artist: 'Beyoncé',
            name: 'Partition',
        },
        {
            id: 'spotify:track:7rl7ao5pb9BhvAzPdWStxi',
            artist: 'Beyoncé',
            name: 'Telephone',
        },
        {
            id: 'spotify:track:6RX5iL93VZ5fKmyvNXvF1r',
            artist: 'Beyoncé',
            name: 'Irreplaceable',
        },
        {
            id: 'spotify:track:6g0Orsxv6glTJCt4cHsRsQ',
            artist: 'Beyoncé',
            name: 'Formation',
        },
        {
            id: 'spotify:track:1uXbwHHfgsXcUKfSZw5ZJ0',
            artist: 'Beyoncé',
            name: 'Run the World (Girls)',
        }
      ];

const SPOTIFY_USER_OAUTH = process.env.SPOTIFY_USER_OAUTH;

// 
describe('Spotify', function() {
    describe('Connect to spotify', function () {
        it('When making a successful connection, should get a valid access_token from the API', async function () {
            let sut = await Spotify.connect();

            expect(Spotify.api.getAccessToken()).toBeDefined();
        });
    });


    describe('Find track', function () {
        it('When running a simple search for a Beyonce song, should return list of songs', async function () {
            const q = 'Beyoncé - Halo',
                  limit = 7;

            let sut = await Spotify.searchTracks(q, limit);

            expect(sut.tracks.items.length).toBe(limit);
            expect(sut.tracks.total).toBeGreaterThan(limit);
        });
    });


    describe('Playlist Search Operations', function () {
        // findTrackInPlaylist
        it('When searching a song that exists in a playlist, should return the position', async function () {
            const track = TRACKS[0]; // Beyoncé - Halo

            let sut = await Spotify.findTrackInPlaylist(track.id, PLAYLIST_ID_READONLY);

            expect(sut.name).toBe(track.name);
            expect(sut.position.toString()).toMatch(/[0-9]+/);
        });


        // @todo: convert to throw, should throw when none found.
        it('When searching a song that doesnt exists in a playlist, should return -1', async function () {
            const track = TRACKS[0]; // Beyoncé - Halo

            let sut = await Spotify.findTrackInPlaylist(track.id + 'E_404', PLAYLIST_ID_READONLY);

            expect(sut).toBe(-1);
        });
    });

    describe('Playlist Read Operations', function () {
        // getPlaylist
        it('When getting a playlist information, should return playlist full metadata', async function () {
            let sut = await Spotify.getPlaylist(PLAYLIST_ID_READONLY);

            expect(sut.owner.display_name).toBeDefined();
            expect(sut.name).toBeDefined();
            expect(sut.description).toBeDefined();
        });


        // getPlaylistTracksAllPages
        it('When fetching a long playlist, should return the list of songs from all pages available', async function () {
            let sut = await Spotify.getPlaylistTracksAllPages(PLAYLIST_ID_READONLY);

            expect(sut.total).toBeGreaterThan(PLAYLIST_VALID_LIMIT);
            expect(sut.limit).toBe(PLAYLIST_API_LIMIT_PER_PAGE);
            expect(sut.items.length).toBeGreaterThan(PLAYLIST_VALID_LIMIT);
            expect(sut.total / PLAYLIST_API_LIMIT_PER_PAGE).toBeGreaterThan(PLAYLIST_VALID_LIMIT / PLAYLIST_API_LIMIT_PER_PAGE);
        });


        // getPlaylistTracks
        it('When fetching a long playlist, should return the maximum allowed number of tracks', async function () {
            const offset = 0;

            let sut = await Spotify.getPlaylistTracks(PLAYLIST_ID_READONLY, PLAYLIST_API_LIMIT_PER_PAGE, offset);

            expect(sut.items.length).toBe(PLAYLIST_API_LIMIT_PER_PAGE);
            expect(sut.limit).toBe(PLAYLIST_API_LIMIT_PER_PAGE);
        });


        
        it('When fetching a long list should be able to offset by 7 successfully', async function () {
            const limit = 30,
                  offsetBase = 0,
                  offset = 7;

            let sut = await Spotify.getPlaylistTracks(PLAYLIST_ID_READONLY, limit, offset);
            let sutBase = await Spotify.getPlaylistTracks(PLAYLIST_ID_READONLY, limit, offsetBase);

            expect(sut.items[0].track.uri).toBe(sutBase.items[offset].track.uri); // inspect the offset compared to base.
            expect(sut.items.slice(0, -offset)).toEqual(sutBase.items.slice(offset)); // deep compare the offset.
            expect(sut.limit).toBe(limit); // verify response limit
        });


        // getPlaylistTracks should throw test case.
    });


    describe('Playlist Write Operations', function () {
        const setPredefinedSongsToAPlaylist = async (playlistID, tracksListRaw, limit) => {
            const tracksList = tracksListRaw.map(({ id, artist, name }) => id).slice(0, limit);

            try {
                let newPlaylist = await Spotify.replaceTracksInPlaylist(PLAYLIST_ID_READWRITE, tracksList);
            } catch(err) {
                throw 'Failed to replaceTracksInPlaylist, error: ' + err;
            }
        };


        beforeEach(async () => {
            const limit = 6;

            Spotify.api.setAccessToken(SPOTIFY_USER_OAUTH);

            await setPredefinedSongsToAPlaylist(PLAYLIST_ID_READWRITE, TRACKS, limit);

            return true;
        });  


        it('When modifying a playlist description, should verify change is immediate', async function () {
            const props = {
                name: '[DEV] [CI] TESTING PLAYING - READ/WRITE',
                public: false,
                description: 'ci passed runtime: '+ Date.now()
            };

            let sut = await Spotify.playlistUpdateDetails(PLAYLIST_ID_READWRITE, props);
            let afterChange = await Spotify.getPlaylist(PLAYLIST_ID_READWRITE);

            expect(afterChange.name).toBe(props.name);
            expect(afterChange.public).toBe(props.public);
            expect(afterChange.description).toBe(props.description);
        });


        it('Should take 2 tracks from the end of the playlist and make them first', async function () {
            const limit = 10,
                  offset = 0,
                  amountOfTracksToMove = 2;

            let tracksBase = await Spotify.getPlaylistTracks(PLAYLIST_ID_READWRITE, limit, offset);
            
            const rangeLength = amountOfTracksToMove, // from the index, take range of 2, meaning 2 consecutive tracks
                  rangeStart = tracksBase.total - amountOfTracksToMove, // Take index number 4 for example
                  insertBefore = 0; // where to insert the moved tracks - 0 is the beginning of the list.
            let sut = await Spotify.reorderTracksInPlaylist(PLAYLIST_ID_READWRITE, rangeLength, rangeStart, insertBefore);

            let tracksAfterChange = await Spotify.getPlaylistTracks(PLAYLIST_ID_READWRITE, limit, offset);

            expect(sut.snapshot_id).toBeDefined();
            expect(tracksAfterChange.items[0].track.uri).toBe(tracksBase.items[tracksBase.total - amountOfTracksToMove].track.uri); // compare first track
            expect(tracksAfterChange.items[1].track.uri).toBe(tracksBase.items[tracksBase.total - amountOfTracksToMove + 1].track.uri); // compare second track
        });


        it('Should override the content of a playlist with a list of songs', async function () {
            const limit = 10,
                  offset = 0,
                  amountOfSongsToInsert = 3;

            const tracksBase = await Spotify.getPlaylistTracks(PLAYLIST_ID_READWRITE, limit, offset);

            const tracksList = TRACKS.map(({ id, artist, name }) => id).slice(-amountOfSongsToInsert);
            const sut = await Spotify.replaceTracksInPlaylist(PLAYLIST_ID_READWRITE, tracksList);

            const tracksAfterChange = await Spotify.getPlaylistTracks(PLAYLIST_ID_READWRITE, limit, offset);

            expect(tracksAfterChange.items[0].track.uri).toBe(TRACKS[TRACKS.length - amountOfSongsToInsert + 0].id); // compare first track
            expect(tracksAfterChange.items[1].track.uri).toBe(TRACKS[TRACKS.length - amountOfSongsToInsert + 1].id); // compare second track
            expect(tracksAfterChange.items[2].track.uri).toBe(TRACKS[TRACKS.length - amountOfSongsToInsert + 2].id); // compare third track
        });


        it('slicePlaylist', async function () {
            const limit = 10,
                  offset = 0,
                  slicePlaylistTo = 7;

            const tracksBase = await Spotify.getPlaylistTracks(PLAYLIST_ID_READWRITE, limit, offset);

            const sut = await Spotify.slicePlaylist(PLAYLIST_ID_READWRITE, slicePlaylistTo);

            const tracksAfterChange = await Spotify.getPlaylistTracks(PLAYLIST_ID_READWRITE, limit, offset);
        });
    });
});