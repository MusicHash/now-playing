import MySQLWrapper from '../../utils/mysql_wrapper.js';


/*
    -- Description:
    --   Most Played Songs in a Specific Time Frame: Identify the most played songs in a given date range.

    -- Example output:
    -- +----------------------------+------------------------+--------------------------+---------------------+-------------+
    -- | spotify_track_id           | spotify_artist_title   | spotify_track_title      | spotify_popularity | play_count |
    -- +----------------------------+------------------------+--------------------------+---------------------+-------------+
    -- | 2qSkIjg1o9h3YT9RAgYN75     | Sabrina Carpenter      | Espresso                 | 100                 | 636         |
    -- | 2FQrifJ1N335Ljm3TjTVVf     | Shaboozey              | A Bar Song (Tipsy)       | 93                  | 555         |
    -- | 7221xIgOnuakPdLqT0F3nP     | Post Malone            | I Had Some Help (Feat. Morgan Wallen) | 95     | 550         |
    -- | 6dOtVTDdiauQNBQEDOtlAB     | Billie Eilish          | BIRDS OF A FEATHER       | 98                  | 404         |
    -- | 3dj4wgM3cPeuLwMNHDuBon     | Teddy Swims            | The Door                 | 85                  | 400         |
    -- | 0lBwoEOqZNwm07Pd8Hwj3L     | Sabrina Carpenter      | Please Please Please     | 64                  | 393         |
    -- | 2uqYupMHANxnwgeiXTZXzd     | Dasha                  | Austin (Boots Stop Workin') | 91               | 367         |
    -- | 3dYD57lRAUcMHufyqn9GcI     | Hozier                 | Take Me To Church        | 83                  | 364         |
    -- | 0WbMK4wrZ1wFSty9F7FCgu     | Chappell Roan          | Good Luck, Babe!         | 94                  | 344         |
    -- | 5AJ9hqTS2wcFQCELCFRO7A     | Tommy Richman          | MILLION DOLLAR BABY      | 94                  | 319         |
    -- | 0Zbbxnx4SGGHoIow4PpISP     | Kygo                   | Stargazing               | 64                  | 288         |
    -- | 5q0EXnBYyeCdXD72FzJxH0     | Dua Lipa               | Illusion                 | 80                  | 282         |
    -- | 6WO7IDGLakjO38lsvI2gHB     | Benson Boone           | Slow It Down             | 77                  | 253         |
    -- | 629DixmZGHc7ILtEntuiWE     | Billie Eilish          | LUNCH                    | 95                  | 242         |
    -- | 6W6ssWo1mqA9bLTo47Alsz     | Jasmin Moallem         | צונאמי                    | 45                  | 234       |
    -- | 7z3PblAN3dH1JMewiRydkZ     | The Kid LAROI          | GIRLS                    | 81                  | 229         |
    -- | 561jH07mF1jHuk7KlaeF0s     | Eminem                 | Mockingbird              | 86                  | 220         |
    -- | 1a6Kv1hR2T07sa1MklMCo7     | Luciano Mun            | We can´t be friends (Ariana Grande) | 12       | 219         |
    -- | 6tNQ70jh4OwmPGpYy6R2o9     | Benson Boone           | Beautiful Things         | 92                  | 216         |
    -- | 2Zo1PcszsT9WQ0ANntJbID     | Sabrina Carpenter      | Feather                  | 89                  | 208         |
    -- | 4q5YezDOIPcoLr8R81x9qy     | Taylor Swift           | I Can Do It With a Broken Heart | 87           | 205         |
    -- | 331l3xABO0HMr1Kkyh2LZq     | David Guetta           | I Don't Wanna Wait       | 90                  | 205         |
    -- | 4Dvkj6JhhA12EX05fT7y2e     | Harry Styles           | As It Was                | 91                  | 184         |
    -- | 6usohdchdzW9oML7VC4Uhk     | Teddy Swims            | Lose Control             | 85                  | 178         |
    -- | 1YsU8rW2u8z4F0pwOBQ4Ea     | Coldplay               | feelslikeimfallinginlove | 83                  | 177         |
    -- +----------------------------+------------------------+--------------------------+---------------------+-------------+
*/
const getMostPlayedSongsByStation = async function(stationKey, daysRange = 30, limit = 100) {
    const query = `
        SELECT
            spotify_tracks.spotify_track_id,
            spotify_tracks.spotify_artist_title,
            spotify_tracks.spotify_track_title,
            spotify_tracks.spotify_popularity,
            COUNT(*) AS play_count
        FROM
            nowplaying_station_log station_log
        JOIN
            nowplaying_spotify_tracks spotify_tracks
            ON station_log.spotify_id = spotify_tracks.spotify_id
        WHERE
            station_log.log_datetime_played >= NOW() - INTERVAL ? DAY -- 30
            AND 
            station_log.log_station_id = ? -- glz-onair
        GROUP BY
            spotify_tracks.spotify_track_id,
            spotify_tracks.spotify_artist_title,
            spotify_tracks.spotify_track_title,
            spotify_tracks.spotify_popularity  
        ORDER BY play_count DESC
        LIMIT ?
    `;

    // fetch
    const [result] = await MySQLWrapper.query(query, [
        daysRange,
        stationKey,
        limit,
    ]);

    const trackIds = result.map(item => 'spotify:track:' + item.spotify_track_id);
    return trackIds;
}


export {
    getMostPlayedSongsByStation,
};
