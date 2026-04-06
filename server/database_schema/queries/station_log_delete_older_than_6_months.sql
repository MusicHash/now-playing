-- Description:
--   Remove Capital FM play-log rows older than 6 months to cap table growth.
--   Station id: capitalfm-now (see server/config/sources.js).
--   Wrap in START TRANSACTION; ROLLBACK / COMMIT for safety.
--
-- Dry run (row count to be removed):
-- SELECT COUNT(*) AS rows_to_delete
-- FROM nowplaying_station_log
-- WHERE log_station_id IN ('capitalfm-now')
--   AND log_datetime_played < NOW() - INTERVAL 6 MONTH;

-- Query:
DELETE FROM nowplaying_station_log
WHERE log_station_id IN ('capitalfm-now')
  AND log_datetime_played < NOW() - INTERVAL 6 MONTH;
