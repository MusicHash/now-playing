-- Description:
--   Dry run: list rows that would be removed — same station, same spotify_id as the
--   immediately previous row (by log_id). Uses LAG (MySQL 8+).
--   Change the station filter before running.

-- Query:
SELECT
    log_id,
    spotify_id,
    log_artist,
    log_title,
    log_timestamp_played
FROM (
    SELECT
        log_id,
        spotify_id,
        log_artist,
        log_title,
        log_timestamp_played,
        LAG(spotify_id) OVER (ORDER BY log_id) AS prev_spotify_id
    FROM nowplaying_station_log
    WHERE log_station_id = 'dorognoe-ru-live'
) AS t
WHERE prev_spotify_id IS NOT NULL
  AND spotify_id = prev_spotify_id
ORDER BY log_id;
