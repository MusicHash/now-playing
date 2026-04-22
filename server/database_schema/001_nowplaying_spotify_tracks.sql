CREATE TABLE `nowplaying_spotify_tracks`(
    `spotify_id` INT NOT NULL AUTO_INCREMENT,
    `spotify_track_id` VARCHAR(60) NOT NULL COMMENT '3SkVJ7vpdmLSWPgnGTPqsW',
	`spotify_artist_id` VARCHAR(60) NOT NULL COMMENT '72Nhcx7prNk2ZCxhx0Y5es',
    `spotify_isrc` VARCHAR(15) NULL DEFAULT NULL COMMENT 'From Spotify Track external_ids.isrc',
    `spotify_release_date` DATE NULL DEFAULT NULL COMMENT 'From Spotify Track album.release_date (YYYY-MM-DD)',
	`spotify_artist_title` VARCHAR(150) NOT NULL,
    `spotify_track_title` VARCHAR(150) NOT NULL,
	`spotify_duration_ms` INT NOT NULL,
	`spotify_popularity` TINYINT NOT NULL,
    `spotify_timestamp_added` INT NOT NULL,
    PRIMARY KEY(`spotify_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adding Index
ALTER TABLE `nowplaying_spotify_tracks`
  ADD KEY `spotify_track_id` (`spotify_track_id`);

