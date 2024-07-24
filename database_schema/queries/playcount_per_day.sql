-- Description:
--   Fetch all plays per day, in the last 30d from all stations.

-- Example output:
-- +------------+-----------+------------+
-- | play_date  |  weekday  | play_count |
-- +------------+-----------+------------+
-- | 2024-07-24 | Wednesday |       2059 |
-- | 2024-07-23 | Tuesday   |       3071 |
-- | 2024-07-22 | Monday    |       3284 |
-- | 2024-07-21 | Sunday    |       2504 |
-- | 2024-07-20 | Saturday  |        738 |
-- | 2024-07-19 | Friday    |        634 |
-- | 2024-07-18 | Thursday  |       3282 |
-- | 2024-07-17 | Wednesday |       3220 |
-- | 2024-07-16 | Tuesday   |       3389 |
-- | 2024-07-15 | Monday    |       3253 |
-- | 2024-07-14 | Sunday    |       2110 |
-- | 2024-07-13 | Saturday  |       3409 |
-- | 2024-07-12 | Friday    |       3254 |
-- | 2024-07-11 | Thursday  |       1425 |
-- +------------+-----------+------------+


-- Query:
SELECT
    DATE(log_datetime_played) AS play_date,
    DAYNAME(log_datetime_played) AS weekday,
    COUNT(*) AS play_count
FROM
    nowplaying_station_log
WHERE
    log_datetime_played >= NOW() - INTERVAL 30 DAY
GROUP BY
    play_date,
    weekday
ORDER BY
    play_date DESC;


----------------------------------------------------------------------------------------


-- Description:
--   Fetching all stations and counts the amount of plays per day, in the last 30 days

-- Example output:
-- +-------------------------+------------+-----------+------------+
-- | log_station_id          | play_date  |  weekday  | play_count |
-- +-------------------------+------------+-----------+------------+
-- | 99-mow                  | 2024-07-24 | Wednesday |        231 |
-- | capitalfm-now           | 2024-07-24 | Wednesday |        470 |
-- | eco99fm-live-radio      | 2024-07-24 | Wednesday |        159 |
-- | euplus-ru-live          | 2024-07-24 | Wednesday |        259 |
-- | glz-onair               | 2024-07-24 | Wednesday |        174 |
-- | virgin-recently-played  | 2024-07-24 | Wednesday |        142 |
-- | xm-hits1                | 2024-07-24 | Wednesday |        261 |
-- | xm-the-pulse            | 2024-07-24 | Wednesday |        308 |
-- | z100-recent             | 2024-07-24 | Wednesday |         57 |
-- | 99-mow                  | 2024-07-23 | Tuesday   |        336 |
-- | capitalfm-now           | 2024-07-23 | Tuesday   |        693 |
-- | eco99fm-live-radio      | 2024-07-23 | Tuesday   |        247 |
-- | euplus-ru-live          | 2024-07-23 | Tuesday   |        386 |
-- | glz-onair               | 2024-07-23 | Tuesday   |        265 |
-- | virgin-recently-played  | 2024-07-23 | Tuesday   |        215 |
-- | xm-hits1                | 2024-07-23 | Tuesday   |        411 |
-- | xm-the-pulse            | 2024-07-23 | Tuesday   |        433 |
-- | z100-recent             | 2024-07-23 | Tuesday   |         85 |
-- | 99-mow                  | 2024-07-22 | Monday    |        373 |
-- | capitalfm-now           | 2024-07-22 | Monday    |        587 |
-- | eco99fm-live-radio      | 2024-07-22 | Monday    |        282 |
-- | euplus-ru-live          | 2024-07-22 | Monday    |        440 |
-- | glz-onair               | 2024-07-22 | Monday    |        312 |
-- | virgin-recently-played  | 2024-07-22 | Monday    |        247 |
-- | xm-hits1                | 2024-07-22 | Monday    |        454 |
-- +-------------------------+------------+-----------+------------+


-- Query:
SELECT
    log_station_id,
    DATE(log_datetime_played) AS play_date,
    DAYNAME(log_datetime_played) AS weekday,
    COUNT(*) AS play_count
FROM
    nowplaying_station_log
WHERE
    log_datetime_played >= NOW() - INTERVAL 30 DAY
GROUP BY
    log_station_id,
    play_date,
    weekday
ORDER BY
    play_date DESC, log_station_id;

