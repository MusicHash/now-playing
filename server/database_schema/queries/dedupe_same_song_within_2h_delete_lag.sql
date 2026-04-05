-- Description:
--   Delete same-station repeats of the same song within 2 hours (by
--   log_timestamp_played), compared to the previous row for that spotify_id
--   (ORDER BY log_id). Keeps the earlier row; removes the later.
--   MySQL 8+. Wrap in START TRANSACTION; ROLLBACK / COMMIT for safety.
--   Change the station filter before running.

-- Query:
DELETE FROM nowplaying_station_log
WHERE log_id IN (
    SELECT log_id FROM (
        SELECT log_id
        FROM (
            SELECT
                log_id,
                log_timestamp_played,
                LAG(log_timestamp_played) OVER (
                    PARTITION BY log_station_id, spotify_id
                    ORDER BY log_id
                ) AS prev_log_timestamp_played
            FROM nowplaying_station_log
            WHERE log_station_id IN ('97.5fm_gimel', '102fm_tlv', '107.5fm_haifa', '103fm', '91fm_lev_hamedina')
        ) AS x
        WHERE prev_log_timestamp_played IS NOT NULL
          AND log_timestamp_played >= prev_log_timestamp_played
          AND (log_timestamp_played - prev_log_timestamp_played) <= 1800
    ) AS to_delete
);
