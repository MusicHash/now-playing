-- Description:
--   Remove "ping-pong" junk: rows where the same track (spotify_id) appears
--   every other row (A, B, A, B, A, B...) — typical of a crawler bug, not
--   consecutive duplicate rows.
--
--   Rule: delete row i when spotify_id[i] = spotify_id[i-2] AND
--   spotify_id[i] <> spotify_id[i-1] (ORDER BY log_id, PARTITION BY station).
--   Keeps the first A and first B in each run; removes the rest of the chain.
--
--   False positive risk: a legitimate sequence A, B, A (same song twice with
--   one other song between) matches the rule — the third row would be deleted.
--   If that matters for this station, narrow by date range or add an optional
--   time cap (see "Optional time cap" below).
--
--   MySQL 8+. Use dry run first; wrap DELETE in START TRANSACTION; ROLLBACK/COMMIT.
--
--   Performance: restrict how much history is scanned with @window_months (e.g. 3).
--   LAG is computed only over rows in that window, so the first one or two rows
--   after @window_start may not match ping-pong that began just before the cutoff.
--   If needed, re-run with a slightly larger window or a second pass for older data.

-- ---------------------------------------------------------------------------
-- Window (tune @window_months). Run these in the same session as the SELECT/DELETE.
-- Alternative: SET @window_start = '2026-01-01 00:00:00'; (fixed floor, no var)
-- ---------------------------------------------------------------------------
SET @window_months = 3;
SET @window_start = DATE_SUB(NOW(), INTERVAL @window_months MONTH);

-- ---------------------------------------------------------------------------
-- Dry run: rows that would be deleted (z100-recent)
-- ---------------------------------------------------------------------------
WITH ordered AS (
    SELECT
        log_id,
        log_station_id,
        spotify_id,
        log_artist,
        log_title,
        log_timestamp_played,
        log_datetime_played,
        LAG(spotify_id) OVER (
            PARTITION BY log_station_id
            ORDER BY log_id
        ) AS prev_spotify_id,
        LAG(spotify_id, 2) OVER (
            PARTITION BY log_station_id
            ORDER BY log_id
        ) AS prev2_spotify_id,
        LAG(log_timestamp_played, 2) OVER (
            PARTITION BY log_station_id
            ORDER BY log_id
        ) AS prev2_log_timestamp_played
    FROM nowplaying_station_log
    WHERE log_station_id = 'z100-recent'
      AND log_datetime_played >= @window_start
)
SELECT
    log_id,
    spotify_id,
    log_artist,
    log_title,
    log_datetime_played,
    log_timestamp_played,
    prev2_log_timestamp_played,
    (log_timestamp_played - prev2_log_timestamp_played) AS seconds_since_same_track_two_rows_back
FROM ordered
WHERE prev2_spotify_id IS NOT NULL
  AND prev_spotify_id IS NOT NULL
  AND spotify_id = prev2_spotify_id
  AND spotify_id <> prev_spotify_id
ORDER BY log_id;

-- ---------------------------------------------------------------------------
-- Optional time cap (uncomment AND in both places): only flag ping-pong when
-- the same track reappears "two rows back" within N seconds — reduces risk of
-- hitting rare real A,B,A playlists with long gaps. Tune N (e.g. 7200).
-- ---------------------------------------------------------------------------
-- AND (log_timestamp_played - prev2_log_timestamp_played) <= 7200

-- ---------------------------------------------------------------------------
-- DELETE (same predicate as dry run — add optional time cap if needed)
-- ---------------------------------------------------------------------------
START TRANSACTION;
DELETE FROM nowplaying_station_log
WHERE log_id IN (
    SELECT log_id FROM (
        SELECT log_id
        FROM (
            SELECT
                log_id,
                spotify_id,
                LAG(spotify_id) OVER (
                    PARTITION BY log_station_id
                    ORDER BY log_id
                ) AS prev_spotify_id,
                LAG(spotify_id, 2) OVER (
                    PARTITION BY log_station_id
                    ORDER BY log_id
                ) AS prev2_spotify_id
            FROM nowplaying_station_log
            WHERE log_station_id = 'z100-recent'
              AND log_datetime_played >= @window_start
        ) AS x
        WHERE prev2_spotify_id IS NOT NULL
          AND prev_spotify_id IS NOT NULL
          AND spotify_id = prev2_spotify_id
          AND spotify_id <> prev_spotify_id
    ) AS to_delete
);
ROLLBACK;   -- verify row counts / spot-check first
COMMIT;
