-- Description:
--   Same-station repeats of the same song within @repeat_window_seconds (by
--   log_timestamp_played vs previous row for that spotify_id, ORDER BY log_id).
--   Keeps the earlier log_id; the later row is what the dry run lists and the
--   DELETE removes. Only rows in the last @lookback_months are considered.
--   MySQL 8+ (CTE + window functions).
--
--   Workflow: edit the SET block once, run the file (or the dry-run queries) to
--   review results. Uncomment the DELETE block at the bottom and run it inside
--   START TRANSACTION; … ROLLBACK or COMMIT. The DELETE is commented so a full
--   script run does not delete by accident.
--
--   Lookback note: LAG only considers rows that pass the time filter. The first
--   row(s) right after the lookback cutoff have no in-window predecessor, so a
--   repeat within the window that crosses that cutoff is not flagged. For
--   full-history pairing while deleting only recent rows, widen or drop the
--   log_timestamp_played filter and add a separate predicate on rows to delete.

-- ---------------------------------------------------------------------------
-- Tunables (edit before running — used by dry run and DELETE below)
-- ---------------------------------------------------------------------------
SET @repeat_window_seconds = 600;  -- e.g. 600 = 10 minutes; 7200 = 2 hours
SET @lookback_months = 3;          -- only rows with log_timestamp_played >= this many months ago
SET @lookback_min_ts = UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL @lookback_months MONTH));
-- Comma-separated station ids (no spaces after commas). Examples:
--   '95.8fm_capitalfm_london'
--   '95.8fm_capitalfm_london,102fm_tlv'
SET @station_ids = '95.8fm_capitalfm_london';

-- ---------------------------------------------------------------------------
-- Dry run — detail: every row that would be removed
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
    WHERE FIND_IN_SET(log_station_id, @station_ids)
      AND log_timestamp_played >= @lookback_min_ts
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
  AND (log_timestamp_played - prev_log_timestamp_played) <= @repeat_window_seconds
ORDER BY log_station_id, log_id;

-- ---------------------------------------------------------------------------
-- Dry run — summary: how many rows per station would be removed
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
    WHERE FIND_IN_SET(log_station_id, @station_ids)
      AND log_timestamp_played >= @lookback_min_ts
)
SELECT
    log_station_id,
    COUNT(*) AS rows_that_would_be_deleted
FROM flagged
WHERE prev_log_timestamp_played IS NOT NULL
  AND log_timestamp_played >= prev_log_timestamp_played
  AND (log_timestamp_played - prev_log_timestamp_played) <= @repeat_window_seconds
GROUP BY log_station_id
ORDER BY rows_that_would_be_deleted DESC, log_station_id;

-- ---------------------------------------------------------------------------
-- Execute: DELETE (uncomment after dry run; use transaction)
-- ---------------------------------------------------------------------------
-- START TRANSACTION;
--
-- DELETE FROM nowplaying_station_log
-- WHERE log_id IN (
--     SELECT log_id FROM (
--         SELECT log_id
--         FROM (
--             SELECT
--                 log_id,
--                 log_timestamp_played,
--                 LAG(log_timestamp_played) OVER (
--                     PARTITION BY log_station_id, spotify_id
--                     ORDER BY log_id
--                 ) AS prev_log_timestamp_played
--             FROM nowplaying_station_log
--             WHERE FIND_IN_SET(log_station_id, @station_ids)
--               AND log_timestamp_played >= @lookback_min_ts
--         ) AS x
--         WHERE prev_log_timestamp_played IS NOT NULL
--           AND log_timestamp_played >= prev_log_timestamp_played
--           AND (log_timestamp_played - prev_log_timestamp_played) <= @repeat_window_seconds
--     ) AS to_delete
-- );
-- 
-- pick one:
-- ROLLBACK;
-- or
-- COMMIT;
