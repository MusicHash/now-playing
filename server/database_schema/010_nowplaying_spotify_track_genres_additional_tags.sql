ALTER TABLE `nowplaying_spotify_track_genres`
ADD COLUMN `additional_tags` JSON NULL
    COMMENT 'JSON array of normalized secondary genre tags from Last.fm'
    AFTER `genre`;
