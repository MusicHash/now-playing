-- Description:
--   Same-station repeats of the same song within @repeat_window_seconds (by
--   log_timestamp_played vs previous row for that spotify_id, ORDER BY log_id).
--   Keeps the earlier log_id; the later row is what the dry run lists and the
--   DELETE removes. Only rows in the last @lookback_months are considered.
--   MySQL 8+ (CTE + window functions).
--
--   Stations: add one row per station to tmp_dedupe_stations (no comma-separated
--   string, no FIND_IN_SET). Preview queries JOIN that table; LAG is PARTITION BY
--   log_station_id, so this matches checking each station separately.
--
--   phpMyAdmin: use one SELECT per section below (no dozens of result sets from a
--   loop). If you must disable FK checks around DELETE, use SET FOREIGN_KEY_CHECKS = 0
--   before and SET FOREIGN_KEY_CHECKS = 1 after — MySQL does not accept ON/OFF.
--
--   Mode: set @dry_run = 1 to only list rows (safe default). Set @dry_run = 0 to
--   run the DELETE. When deleting, @commit_after_delete controls COMMIT vs ROLLBACK.
--
--   Lookback note: LAG only considers rows that pass the time filter. The first
--   row(s) right after the lookback cutoff have no in-window predecessor, so a
--   repeat within the window that crosses that cutoff is not flagged. For
--   full-history pairing while deleting only recent rows, widen or drop the
--   log_timestamp_played filter and add a separate predicate on rows to delete.

-- ---------------------------------------------------------------------------
-- Tunables (edit before running)
-- ---------------------------------------------------------------------------
SET @dry_run = 1;                  -- 1 = preview only (no DELETE). 0 = execute DELETE below.
SET @commit_after_delete = 1;      -- only when @dry_run = 0: 1 = COMMIT, 0 = ROLLBACK (test path)

SET @repeat_window_seconds = 600;  -- e.g. 600 = 10 minutes; 7200 = 2 hours
SET @lookback_months = 1;          -- only rows with log_timestamp_played >= this many months ago
SET @lookback_min_ts = UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL @lookback_months MONTH));

-- One row per station to process (must match log_station_id; VARCHAR(25) per schema).
-- List matches `stations` in server/config/sources.js (add/remove rows if your DB differs).
DROP TEMPORARY TABLE IF EXISTS tmp_dedupe_stations;
CREATE TEMPORARY TABLE tmp_dedupe_stations (
    station_id VARCHAR(25) NOT NULL PRIMARY KEY
);
INSERT INTO tmp_dedupe_stations (station_id) VALUES
    ('100.3fm_z100_nyc'),
    ('100fm_hits'),
    ('100fm_radius'),
    ('101fm_jerusalem'),
    ('102fm_eilat'),
    ('102fm_tel-aviv'),
    ('103fm_radio_lelo_hafsaka'),
    ('106.2fm_europaplus_moscow'),
    ('107.5fm_haifa'),
    ('24music'),
    ('88fm'),
    ('90fm_radio_emtza_hadereh'),
    ('91fm_lev-hamedina'),
    ('95.8fm_capitalfm_london'),
    ('96.0fm_dorognoe_moscow'),
    ('96.6fm_glz'),
    ('97.5fm_gimel'),
    ('97fm_darom'),
    ('98.1fm_galgalatz'),
    ('99fm_eco'),
    ('997fm_mow'),
    ('xm-hits1'),
    ('xm-the-pulse'),
    ('radioplus'),
    ('virgin');

-- ---------------------------------------------------------------------------
-- Preview — detail: every row that would be removed (single result set)
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
    FROM nowplaying_station_log nsl
    INNER JOIN tmp_dedupe_stations s ON s.station_id = nsl.log_station_id
    WHERE nsl.log_timestamp_played >= @lookback_min_ts
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
-- Preview — summary: how many rows per station would be removed
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
    FROM nowplaying_station_log nsl
    INNER JOIN tmp_dedupe_stations s ON s.station_id = nsl.log_station_id
    WHERE nsl.log_timestamp_played >= @lookback_min_ts
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
-- Execute DELETE when @dry_run = 0 (otherwise skipped)
-- If you need to relax FK checks for the DELETE, run these around the whole script
-- (or immediately before/after CALL below) — use 0 and 1 only, not ON/OFF:
--   SET FOREIGN_KEY_CHECKS = 0;
--   ... run preview + CALL ...
--   SET FOREIGN_KEY_CHECKS = 1;
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS tmp_sp_dedupe_repeat_apply_delete;
DELIMITER //
CREATE PROCEDURE tmp_sp_dedupe_repeat_apply_delete()
BEGIN
    DECLARE deleted_rows INT DEFAULT 0;

    IF IFNULL(@dry_run, 1) <> 0 THEN
        SELECT
            'skipped' AS delete_status,
            'dry_run=1 — no DELETE executed' AS message,
            IFNULL(@dry_run, 1) AS dry_run;
    ELSE
        START TRANSACTION;
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
                    FROM nowplaying_station_log nsl
                    INNER JOIN tmp_dedupe_stations s ON s.station_id = nsl.log_station_id
                    WHERE nsl.log_timestamp_played >= @lookback_min_ts
                ) AS x
                WHERE prev_log_timestamp_played IS NOT NULL
                  AND log_timestamp_played >= prev_log_timestamp_played
                  AND (log_timestamp_played - prev_log_timestamp_played) <= @repeat_window_seconds
            ) AS to_delete
        );
        SET deleted_rows = ROW_COUNT();
        IF IFNULL(@commit_after_delete, 1) <> 0 THEN
            COMMIT;
            SELECT
                'committed' AS delete_status,
                deleted_rows AS rows_deleted,
                IFNULL(@commit_after_delete, 1) AS commit_after_delete;
        ELSE
            ROLLBACK;
            SELECT
                'rolled_back' AS delete_status,
                deleted_rows AS rows_that_would_have_been_deleted,
                'DELETE was rolled back (@commit_after_delete = 0)' AS message;
        END IF;
    END IF;
END//
DELIMITER ;

CALL tmp_sp_dedupe_repeat_apply_delete();
DROP PROCEDURE IF EXISTS tmp_sp_dedupe_repeat_apply_delete;
