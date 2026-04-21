-- Description:
--   Relink nowplaying_station_log rows for station 96.6fm_glz where log_artist
--   contains a comma (bad pre-fix search): set spotify_id to a row in
--   nowplaying_spotify_tracks whose spotify_track_title equals log_title
--   (column collation utf8mb4_unicode_ci).
--
--   When several tracks share the same spotify_track_title, pick one row:
--   highest spotify_popularity, then lowest spotify_id (same tie-break as
--   station_log_backfill_canonical_spotify_id.sql).
--
--   Requires MySQL 8+ (window functions). Preview before updating; use a transaction.
--
-- ---------------------------------------------------------------------------
-- 1) Preview: how many log rows qualify (comma in artist, station GLZ)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS glz_log_rows_with_comma_in_artist
FROM nowplaying_station_log sl
WHERE sl.log_station_id = '96.6fm_glz'
  AND TRIM(sl.log_title) <> ''
  AND (
      LOCATE(',', sl.log_artist) > 0
  );

-- ---------------------------------------------------------------------------
-- 2) Preview: how many of those would change spotify_id (title match + different id)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS rows_that_would_change
FROM nowplaying_station_log sl
INNER JOIN (
    SELECT
        spotify_id,
        spotify_track_title,
        ROW_NUMBER() OVER (
            PARTITION BY spotify_track_title
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS rn
    FROM nowplaying_spotify_tracks
) pick ON pick.spotify_track_title = sl.log_title
    AND pick.rn = 1
WHERE sl.log_station_id = '96.6fm_glz'
  AND TRIM(sl.log_title) <> ''
  AND (
      LOCATE(',', sl.log_artist) > 0
  )
  AND sl.spotify_id <> pick.spotify_id;

-- ---------------------------------------------------------------------------
-- 3) Sample: current vs proposed (adjust LIMIT)
-- ---------------------------------------------------------------------------
SELECT
    sl.log_id,
    sl.spotify_id AS current_spotify_id,
    pick.spotify_id AS new_spotify_id,
    sl.log_artist,
    sl.log_title,
    st_old.spotify_track_title AS current_spotify_track_title,
    st_old.spotify_artist_title AS current_spotify_artist_title,
    pick.spotify_track_title AS picked_track_title
FROM nowplaying_station_log sl
INNER JOIN (
    SELECT
        spotify_id,
        spotify_track_title,
        spotify_popularity,
        ROW_NUMBER() OVER (
            PARTITION BY spotify_track_title
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS rn
    FROM nowplaying_spotify_tracks
) pick ON pick.spotify_track_title = sl.log_title
    AND pick.rn = 1
LEFT JOIN nowplaying_spotify_tracks st_old ON st_old.spotify_id = sl.spotify_id
WHERE sl.log_station_id = '96.6fm_glz'
  AND TRIM(sl.log_title) <> ''
  AND (
      LOCATE(',', sl.log_artist) > 0
  )
  AND sl.spotify_id <> pick.spotify_id
ORDER BY sl.log_id DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 4) Log rows that qualify but have no matching spotify_track_title (optional QA)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS glz_comma_artist_rows_with_no_title_match
FROM nowplaying_station_log sl
WHERE sl.log_station_id = '96.6fm_glz'
  AND TRIM(sl.log_title) <> ''
  AND (
      LOCATE(',', sl.log_artist) > 0
  )
  AND NOT EXISTS (
      SELECT 1
      FROM nowplaying_spotify_tracks st
      WHERE st.spotify_track_title = sl.log_title
  );

-- ---------------------------------------------------------------------------
-- 5) Apply (run inside TRANSACTION; verify with sections 2–3 then COMMIT or ROLLBACK)
-- --------------------------------------------------------------------------
START TRANSACTION; UPDATE nowplaying_station_log sl
INNER JOIN (
    SELECT
        spotify_id,
        spotify_track_title,
        ROW_NUMBER() OVER (
            PARTITION BY spotify_track_title
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS rn
    FROM nowplaying_spotify_tracks
) pick ON pick.spotify_track_title = sl.log_title
    AND pick.rn = 1
SET sl.spotify_id = pick.spotify_id
WHERE sl.log_station_id = '96.6fm_glz'
  AND TRIM(sl.log_title) <> ''
  AND (
      LOCATE(',', sl.log_artist) > 0
  )
  AND sl.spotify_id <> pick.spotify_id; COMMIT;
-- ROLLBACK;
