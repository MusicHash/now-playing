ALTER TABLE `nowplaying_spotify_tracks`
  ADD COLUMN `spotify_release_date` DATE NULL DEFAULT NULL COMMENT 'From Spotify Track album.release_date (YYYY-MM-DD)' AFTER `spotify_isrc`;
