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


-- Query:
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
    station_log.log_datetime_played BETWEEN 'start_date' AND 'end_date'
GROUP BY
    spotify_tracks.spotify_track_id,
    spotify_tracks.spotify_artist_title,
    spotify_tracks.spotify_track_title,
    spotify_tracks.spotify_popularity  
ORDER BY `play_count` DESC

----------------------------------------------------------------------------------------

-- Description:
--   Most played artist

-- Example output:
-- +---------------------+-------------+
-- | log_artist          | play_count  |
-- +---------------------+-------------+
-- | Sabrina Carpenter   | 1339        |
-- | Billie Eilish       | 698         |
-- | Taylor Swift        | 661         |
-- | Dua Lipa            | 572         |
-- | Shaboozey           | 545         |
-- | Teddy Swims         | 532         |
-- | Chappell Roan       | 530         |
-- | Ariana Grande       | 519         |
-- | Benson Boone        | 510         |
-- | Dasha               | 426         |
-- | Katy Perry          | 412         |
-- | Hozier              | 400         |
-- | Harry Styles        | 352         |
-- | Coldplay            | 330         |
-- | Myles Smith         | 327         |
-- | Eminem              | 307         |
-- | Doja Cat            | 285         |
-- | Olivia Rodrigo      | 282         |
-- | Tommy Richman       | 278         |
-- | The Kid LAROI       | 246         |
-- | Post Malone/Morgan Wallen | 243   |
-- | Becky Hill          | 236         |
-- | Ed Sheeran          | 235         |
-- | Perrie              | 218         |
-- | SZA                 | 208         |
-- +---------------------+-------------+


-- Query:
SELECT
    log_artist,
    COUNT(*) AS play_count
FROM
    nowplaying_station_log
GROUP BY
    log_artist
ORDER BY
    play_count DESC;


----------------------------------------------------------------------------------------



SELECT
    log_station_id,
    COUNT(*) AS play_count
FROM
    nowplaying_station_log
GROUP BY
    log_station_id
ORDER BY
    play_count DESC;


----------------------------------------------------------------------------------------


-- Description:
--   Most popular station

-- Example output:
-- +------------------------+---------+
-- | log_station_id         | play_count |
-- +------------------------+---------+
-- | capitalfm-now          | 7296    |
-- | xm-the-pulse           | 5409    |
-- | xm-hits1               | 4938    |
-- | euplus-ru-live         | 4624    |
-- | 99-mow                 | 3851    |
-- | glz-onair              | 3452    |
-- | eco99fm-live-radio     | 3121    |
-- | virgin-recently-played | 2649    |
-- | z100-recent            | 928     |
-- +------------------------+---------+



-- Query:
SELECT
    log_station_id,
    COUNT(*) AS play_count
FROM
    nowplaying_station_log
GROUP BY
    log_station_id
ORDER BY
    play_count DESC;


----------------------------------------------------------------------------------------

