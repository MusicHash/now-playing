-- Description:
--   Merge duplicate nowplaying_spotify_tracks rows that share the same non-null
--   spotify_isrc into a single canonical row per ISRC.
--
--   Steps (must stay in this order — FK safety):
--     1) Remap nowplaying_station_log.spotify_id to the canonical track.
--     2) Remap nowplaying_chart_log.spotify_id the same way.
--     3) DELETE non-canonical duplicate rows from nowplaying_spotify_tracks.
--
--   Canonical row rule (change ORDER BY if you want a different policy):
--     highest spotify_popularity, then lowest spotify_id (stable tie-break).
--
--   Scope:
--     Only rows with spotify_isrc IS NOT NULL participate. Tracks with NULL ISRC
--     are not merged by this script.
--
--   MySQL: 8.x+ (window functions). Tested conceptually for 8.4.
--
--   After merge:
--     New duplicate rows can appear again when the app inserts another
--     spotify_track_id for the same ISRC, unless you enforce uniqueness in app
--     or add a trigger / unique strategy for spotify_isrc.
--
-- How to run:
--   1) Run the preview and COUNT queries; confirm results.
--   2) Uncomment START TRANSACTION through COMMIT in section "APPLY MERGE".
--   3) Run the block once; use ROLLBACK instead of COMMIT if anything looks wrong.

-- ---------------------------------------------------------------------------
-- PREVIEW: station_log rows that would be remapped (sample)
-- ---------------------------------------------------------------------------
SELECT
    sl.log_id,
    sl.spotify_id AS from_spotify_id,
    r.canon_spotify_id AS to_spotify_id
FROM nowplaying_station_log sl
INNER JOIN (
    SELECT
        spotify_id,
        FIRST_VALUE(spotify_id) OVER (
            PARTITION BY spotify_isrc
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS canon_spotify_id
    FROM nowplaying_spotify_tracks
    WHERE spotify_isrc IS NOT NULL
) r ON r.spotify_id = sl.spotify_id
WHERE sl.spotify_id <> r.canon_spotify_id
ORDER BY sl.log_id DESC
LIMIT 500;

-- ---------------------------------------------------------------------------
-- PREVIEW: chart_log rows that would be remapped (sample)
-- ---------------------------------------------------------------------------
SELECT
    c.chart_entry_id,
    c.spotify_id AS from_spotify_id,
    r.canon_spotify_id AS to_spotify_id
FROM nowplaying_chart_log c
INNER JOIN (
    SELECT
        spotify_id,
        FIRST_VALUE(spotify_id) OVER (
            PARTITION BY spotify_isrc
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS canon_spotify_id
    FROM nowplaying_spotify_tracks
    WHERE spotify_isrc IS NOT NULL
) r ON r.spotify_id = c.spotify_id
WHERE c.spotify_id IS NOT NULL
  AND c.spotify_id <> r.canon_spotify_id
ORDER BY c.chart_entry_id DESC
LIMIT 500;

-- ---------------------------------------------------------------------------
-- PREVIEW: nowplaying_spotify_tracks rows that would be DELETED (sample)
-- ---------------------------------------------------------------------------
SELECT
    t.spotify_id,
    t.spotify_track_id,
    t.spotify_isrc,
    r.canon_spotify_id
FROM nowplaying_spotify_tracks t
INNER JOIN (
    SELECT
        spotify_id,
        FIRST_VALUE(spotify_id) OVER (
            PARTITION BY spotify_isrc
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS canon_spotify_id
    FROM nowplaying_spotify_tracks
    WHERE spotify_isrc IS NOT NULL
) r ON r.spotify_id = t.spotify_id
WHERE t.spotify_id <> r.canon_spotify_id
ORDER BY t.spotify_isrc, t.spotify_id
LIMIT 500;

-- ---------------------------------------------------------------------------
-- COUNTS
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS station_log_rows_to_remap
FROM nowplaying_station_log sl
INNER JOIN (
    SELECT
        spotify_id,
        FIRST_VALUE(spotify_id) OVER (
            PARTITION BY spotify_isrc
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS canon_spotify_id
    FROM nowplaying_spotify_tracks
    WHERE spotify_isrc IS NOT NULL
) r ON r.spotify_id = sl.spotify_id
WHERE sl.spotify_id <> r.canon_spotify_id;

SELECT COUNT(*) AS chart_log_rows_to_remap
FROM nowplaying_chart_log c
INNER JOIN (
    SELECT
        spotify_id,
        FIRST_VALUE(spotify_id) OVER (
            PARTITION BY spotify_isrc
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS canon_spotify_id
    FROM nowplaying_spotify_tracks
    WHERE spotify_isrc IS NOT NULL
) r ON r.spotify_id = c.spotify_id
WHERE c.spotify_id IS NOT NULL
  AND c.spotify_id <> r.canon_spotify_id;

SELECT COUNT(*) AS spotify_track_rows_to_delete
FROM nowplaying_spotify_tracks t
INNER JOIN (
    SELECT
        spotify_id,
        FIRST_VALUE(spotify_id) OVER (
            PARTITION BY spotify_isrc
            ORDER BY spotify_popularity DESC, spotify_id ASC
        ) AS canon_spotify_id
    FROM nowplaying_spotify_tracks
    WHERE spotify_isrc IS NOT NULL
) r ON r.spotify_id = t.spotify_id
WHERE t.spotify_id <> r.canon_spotify_id;

-- ---------------------------------------------------------------------------
-- APPLY MERGE (uncomment and run as a single transaction)
-- ---------------------------------------------------------------------------
-- START TRANSACTION;
--
-- UPDATE nowplaying_station_log sl
-- INNER JOIN (
--     SELECT
--         spotify_id,
--         FIRST_VALUE(spotify_id) OVER (
--             PARTITION BY spotify_isrc
--             ORDER BY spotify_popularity DESC, spotify_id ASC
--         ) AS canon_spotify_id
--     FROM nowplaying_spotify_tracks
--     WHERE spotify_isrc IS NOT NULL
-- ) r ON r.spotify_id = sl.spotify_id
-- SET sl.spotify_id = r.canon_spotify_id
-- WHERE sl.spotify_id <> r.canon_spotify_id;
--
-- UPDATE nowplaying_chart_log c
-- INNER JOIN (
--     SELECT
--         spotify_id,
--         FIRST_VALUE(spotify_id) OVER (
--             PARTITION BY spotify_isrc
--             ORDER BY spotify_popularity DESC, spotify_id ASC
--         ) AS canon_spotify_id
--     FROM nowplaying_spotify_tracks
--     WHERE spotify_isrc IS NOT NULL
-- ) r ON r.spotify_id = c.spotify_id
-- SET c.spotify_id = r.canon_spotify_id
-- WHERE c.spotify_id IS NOT NULL
--   AND c.spotify_id <> r.canon_spotify_id;
--
-- DELETE t
-- FROM nowplaying_spotify_tracks t
-- INNER JOIN (
--     SELECT
--         spotify_id,
--         FIRST_VALUE(spotify_id) OVER (
--             PARTITION BY spotify_isrc
--             ORDER BY spotify_popularity DESC, spotify_id ASC
--         ) AS canon_spotify_id
--     FROM nowplaying_spotify_tracks
--     WHERE spotify_isrc IS NOT NULL
-- ) r ON r.spotify_id = t.spotify_id
-- WHERE t.spotify_id <> r.canon_spotify_id;
--
-- COMMIT;
-- -- ROLLBACK;
