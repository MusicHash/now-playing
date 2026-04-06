-- Description:
--   Remove nowplaying_spotify_tracks rows that are not referenced by any
--   nowplaying_station_log row (no FK usage in play logs).
--
--   nowplaying_chart_log also references spotify_id with ON DELETE SET NULL:
--   deleting a track that only chart rows point to will set those chart
--   spotify_id values to NULL. Add the optional NOT EXISTS (chart) block below
--   if you want to keep tracks that are still linked from charts only.
--
--   Run the dry run first. Wrap DELETE in START TRANSACTION; ROLLBACK / COMMIT.
--
-- How to run the actual delete:
--   1. Run the dry-run queries below; confirm counts and preview rows.
--   2. Uncomment the DELETE block at the bottom (START TRANSACTION through DELETE).
--   3. Run START TRANSACTION; then DELETE; then either ROLLBACK; (undo) or COMMIT; (keep).

-- ---------------------------------------------------------------------------
-- Dry run: how many and which rows would be removed
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS orphan_spotify_tracks
FROM nowplaying_spotify_tracks t
WHERE NOT EXISTS (
    SELECT 1
    FROM nowplaying_station_log l
    WHERE l.spotify_id = t.spotify_id
);

-- Preview rows (optional; comment out if you only need the count)
SELECT
    t.spotify_id,
    t.spotify_track_id,
    t.spotify_artist_title,
    t.spotify_track_title,
    t.spotify_timestamp_added
FROM nowplaying_spotify_tracks t
WHERE NOT EXISTS (
    SELECT 1
    FROM nowplaying_station_log l
    WHERE l.spotify_id = t.spotify_id
)
ORDER BY t.spotify_id;

-- ---------------------------------------------------------------------------
-- DELETE (same predicate as dry run — uncomment to run)
-- ---------------------------------------------------------------------------
START TRANSACTION;
DELETE t
FROM nowplaying_spotify_tracks t
WHERE NOT EXISTS (
    SELECT 1
    FROM nowplaying_station_log l
    WHERE l.spotify_id = t.spotify_id
);
-- Optional: keep tracks that only appear in chart_log — change the WHERE to end with:
--   ) AND NOT EXISTS ( SELECT 1 FROM nowplaying_chart_log c WHERE c.spotify_id = t.spotify_id );
-- pick one:
-- ROLLBACK;
COMMIT;
