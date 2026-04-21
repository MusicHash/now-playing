-- Add ISRC column for existing databases (greenfield installs may already have it via 001).
ALTER TABLE `nowplaying_spotify_tracks`
  ADD COLUMN `spotify_isrc` VARCHAR(15) NULL DEFAULT NULL COMMENT 'From Spotify Track external_ids.isrc' AFTER `spotify_artist_id`;
