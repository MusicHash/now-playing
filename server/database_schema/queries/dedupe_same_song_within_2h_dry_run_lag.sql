-- Description:
--   Dry run (all stations): rows that would be deleted — same log_station_id and
--   spotify_id as the previous play of that song (by log_id), with repeat within
--   2 hours (log_timestamp_played delta <= 7200). Keeps the earlier log_id.
--   MySQL 8+ only (CTE + window functions).
--
--   Optional: add a WHERE clause inside "flagged" in both statements (same filter
--   in both) to limit stations or a time range. Without a filter, the table is
--   scanned once per statement (two passes).

-- ---------------------------------------------------------------------------
-- Detail: every row that would be removed
-- ---------------------------------------------------------------------------
WITH flagged AS (
    SELECT
        log_station_id,
        log_id,
        spotify_id,
        log_artist,
        log_title,
        log_timestamp_played,
        LAG(log_timestamp_played) OVER (
            PARTITION BY log_station_id, spotify_id
            ORDER BY log_id
        ) AS prev_log_timestamp_played
    FROM nowplaying_station_log
    WHERE log_station_id IN ('97.5fm_gimel', '102fm_tlv', '107.5fm_haifa', '103fm', '91fm_lev_hamedina', '101fm_jerusalem', '98.1fm_galgalatz', '96.6fm_glz', '88fm_kan', 'music.il_tv', '24music_tv')
)
SELECT
    log_station_id,
    log_id,
    spotify_id,
    log_artist,
    log_title,
    log_timestamp_played,
    prev_log_timestamp_played,
    (log_timestamp_played - prev_log_timestamp_played) AS seconds_since_prev_same_song
FROM flagged
WHERE prev_log_timestamp_played IS NOT NULL
  AND log_timestamp_played >= prev_log_timestamp_played
  AND (log_timestamp_played - prev_log_timestamp_played) <= 1800
ORDER BY log_station_id, log_id;

-- ---------------------------------------------------------------------------
-- Summary: how many rows per station would be removed
-- ---------------------------------------------------------------------------
WITH flagged AS (
    SELECT
        log_station_id,
        log_id,
        log_timestamp_played,
        LAG(log_timestamp_played) OVER (
            PARTITION BY log_station_id, spotify_id
            ORDER BY log_id
        ) AS prev_log_timestamp_played
    FROM nowplaying_station_log
    WHERE log_station_id IN ('97.5fm_gimel', '102fm_tlv', '107.5fm_haifa', '103fm', '91fm_lev_hamedina', '101fm_jerusalem', '98.1fm_galgalatz', '96.6fm_glz', '88fm_kan', 'music.il_tv', '24music_tv')
)
SELECT
    log_station_id,
    COUNT(*) AS rows_that_would_be_deleted
FROM flagged
WHERE prev_log_timestamp_played IS NOT NULL
  AND log_timestamp_played >= prev_log_timestamp_played
  AND (log_timestamp_played - prev_log_timestamp_played) <= 1800
GROUP BY log_station_id
ORDER BY rows_that_would_be_deleted DESC, log_station_id;
