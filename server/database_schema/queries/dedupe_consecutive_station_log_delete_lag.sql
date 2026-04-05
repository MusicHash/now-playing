-- Description:
--   Delete consecutive duplicate rows (same station, same spotify_id back-to-back by log_id).
--   Keeps the earlier row; removes the later. MySQL 8+ (LAG). Wrap in START TRANSACTION;
--   ROLLBACK / COMMIT for safety. Change the station filter before running.

-- Query:
DELETE FROM nowplaying_station_log
WHERE log_id IN (
    SELECT log_id FROM (
        SELECT log_id
        FROM (
            SELECT
                log_id,
                spotify_id,
                LAG(spotify_id) OVER (ORDER BY log_id) AS prev_spotify_id
            FROM nowplaying_station_log
            WHERE log_station_id = 'dorognoe-ru-live'
        ) AS x
        WHERE prev_spotify_id IS NOT NULL
          AND spotify_id = prev_spotify_id
    ) AS to_delete
);
