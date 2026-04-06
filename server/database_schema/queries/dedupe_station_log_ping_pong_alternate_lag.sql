-- Description:
--   Remove "ping-pong" junk: two logical slots alternate (A, B, A, B, A, B...),
--   typical of a crawler bug, not consecutive duplicate rows.
--
--   Rule 1 (same Spotify track): spotify_id[i] = spotify_id[i-2] AND
--   spotify_id[i] <> spotify_id[i-1] (ORDER BY log_id, PARTITION BY station).
--
--   Rule 2 (same two artists, track id drifts): when the alternating pair keeps
--   the same artists but spotify_id changes (e.g. Taylor Swift switches from
--   "Opalite" to "The Fate of Ophelia" between alternations), Rule 1 misses.
--   Then: log_artist[i] = log_artist[i-2] AND log_artist[i] <> log_artist[i-1]
--   AND log_artist[i-1] = log_artist[i-3]. The last clause requires an established
--   A,B,A,B alternation so row 3 in a lone X,Y,X is not matched by Rule 2 alone.
--
--   False positive risk: a legitimate A, B, A (same song or same artist twice
--   with one song between) can match — narrow by date or optional time cap below.
--
--   MySQL 8+. Use dry run first; wrap DELETE in START TRANSACTION; ROLLBACK/COMMIT.
--
--   Performance: restrict how much history is scanned with @window_months (e.g. 3).
--   LAG is computed only over rows in that window, so the first one or two rows
--   after @window_start may not match ping-pong that began just before the cutoff.
--   If needed, re-run with a slightly larger window or a second pass for older data.
--
--   Stations: comma-separated log_station_id values (like IN (...)). MySQL has no
--   array type; FIND_IN_SET matches membership. IDs must not contain commas.

-- ---------------------------------------------------------------------------
-- Window + stations. Run these in the same session as the SELECT/DELETE.
-- Alternative: SET @window_start = '2026-01-01 00:00:00'; (fixed floor, no var)
-- ---------------------------------------------------------------------------
SET @window_months = 3;
SET @window_start = DATE_SUB(NOW(), INTERVAL @window_months MONTH);
SET @station_list = 'z100-recent,99-mow';

-- ---------------------------------------------------------------------------
-- Dry run: rows that would be deleted
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
        LAG(log_artist) OVER (
            PARTITION BY log_station_id
            ORDER BY log_id
        ) AS prev_log_artist,
        LAG(log_artist, 2) OVER (
            PARTITION BY log_station_id
            ORDER BY log_id
        ) AS prev2_log_artist,
        LAG(log_artist, 3) OVER (
            PARTITION BY log_station_id
            ORDER BY log_id
        ) AS prev3_log_artist,
        LAG(log_timestamp_played, 2) OVER (
            PARTITION BY log_station_id
            ORDER BY log_id
        ) AS prev2_log_timestamp_played
    FROM nowplaying_station_log
    WHERE FIND_IN_SET(log_station_id, @station_list) > 0
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
    (log_timestamp_played - prev2_log_timestamp_played) AS seconds_since_same_track_two_rows_back,
    CASE
        WHEN prev2_spotify_id IS NOT NULL
             AND prev_spotify_id IS NOT NULL
             AND spotify_id = prev2_spotify_id
             AND spotify_id <> prev_spotify_id
        THEN 'same_spotify_id'
        WHEN prev2_log_artist IS NOT NULL
             AND prev_log_artist IS NOT NULL
             AND prev3_log_artist IS NOT NULL
             AND log_artist = prev2_log_artist
             AND log_artist <> prev_log_artist
             AND prev_log_artist = prev3_log_artist
        THEN 'same_artist_alternation'
    END AS match_rule
FROM ordered
WHERE (
        prev2_spotify_id IS NOT NULL
        AND prev_spotify_id IS NOT NULL
        AND spotify_id = prev2_spotify_id
        AND spotify_id <> prev_spotify_id
      )
   OR (
        prev2_log_artist IS NOT NULL
        AND prev_log_artist IS NOT NULL
        AND prev3_log_artist IS NOT NULL
        AND log_artist = prev2_log_artist
        AND log_artist <> prev_log_artist
        AND prev_log_artist = prev3_log_artist
      )
ORDER BY log_id;

-- ---------------------------------------------------------------------------
-- Optional time cap (uncomment AND in both places): only flag ping-pong when
-- the same track reappears "two rows back" within N seconds — reduces risk of
-- hitting rare real A,B,A playlists with long gaps. Tune N (e.g. 7200).
-- Applies to Rule 1 only (uses prev2_log_timestamp_played).
-- ---------------------------------------------------------------------------
-- AND (log_timestamp_played - prev2_log_timestamp_played) <= 7200

-- ---------------------------------------------------------------------------
-- DELETE (same predicate as dry run — add optional time cap if needed)
--
-- How to run the actual delete:
--   1. Use one MySQL session (CLI, Workbench, etc.).
--   2. Run the SET lines above so @window_start and @station_list are defined.
--   3. Run the dry-run SELECT; confirm rows look right.
--   4. Uncomment the block below (START TRANSACTION through DELETE).
--   5. Run START TRANSACTION; then DELETE; then either ROLLBACK; (undo) or COMMIT; (keep).
--      If you leave the transaction open, run COMMIT or ROLLBACK before closing the session.
-- ---------------------------------------------------------------------------
-- START TRANSACTION;
-- DELETE FROM nowplaying_station_log
-- WHERE log_id IN (
--     SELECT log_id FROM (
--         SELECT log_id
--         FROM (
--             SELECT
--                 log_id,
--                 spotify_id,
--                 log_artist,
--                 LAG(spotify_id) OVER (
--                     PARTITION BY log_station_id
--                     ORDER BY log_id
--                 ) AS prev_spotify_id,
--                 LAG(spotify_id, 2) OVER (
--                     PARTITION BY log_station_id
--                     ORDER BY log_id
--                 ) AS prev2_spotify_id,
--                 LAG(log_artist) OVER (
--                     PARTITION BY log_station_id
--                     ORDER BY log_id
--                 ) AS prev_log_artist,
--                 LAG(log_artist, 2) OVER (
--                     PARTITION BY log_station_id
--                     ORDER BY log_id
--                 ) AS prev2_log_artist,
--                 LAG(log_artist, 3) OVER (
--                     PARTITION BY log_station_id
--                     ORDER BY log_id
--                 ) AS prev3_log_artist
--             FROM nowplaying_station_log
--             WHERE FIND_IN_SET(log_station_id, @station_list) > 0
--               AND log_datetime_played >= @window_start
--         ) AS x
--         WHERE (
--                 prev2_spotify_id IS NOT NULL
--                 AND prev_spotify_id IS NOT NULL
--                 AND spotify_id = prev2_spotify_id
--                 AND spotify_id <> prev_spotify_id
--               )
--            OR (
--                 prev2_log_artist IS NOT NULL
--                 AND prev_log_artist IS NOT NULL
--                 AND prev3_log_artist IS NOT NULL
--                 AND log_artist = prev2_log_artist
--                 AND log_artist <> prev_log_artist
--                 AND prev_log_artist = prev3_log_artist
--               )
--     ) AS to_delete
-- );
-- --pick one:
-- ROLLBACK;
-- COMMIT;
