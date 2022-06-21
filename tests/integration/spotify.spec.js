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
        

        it('When modifying a playlist description, should verify change is immediate', async function () {
            const props = {
                description: 'ci passed runtime: '+ Date.now()
            };

            Spotify.api.setAccessToken(SPOTIFY_USER_OAUTH);

            let sut = await Spotify.playlistUpdateDetails(PLAYLIST_ID_READWRITE, props);
            let afterChange = await Spotify.getPlaylist(PLAYLIST_ID_READWRITE);

            expect(afterChange.description).toBe(props.description);
        });


        
    });
});