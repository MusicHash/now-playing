CREATE TABLE `nowplaying_station_log`(
    `log_id` INT NOT NULL AUTO_INCREMENT,
	`spotify_id` INT NOT NULL,
    `log_station_id` VARCHAR(25) NOT NULL COMMENT 'eco99fm-live-radio',
    `log_artist` VARCHAR(150) NOT NULL,
    `log_title` VARCHAR(150) NOT NULL,
    `log_timestamp_played` INT NOT NULL,
    `log_datetime_played` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(`log_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FOREIGN KEY between tables
ALTER TABLE `nowplaying_station_log`
  ADD CONSTRAINT `fk_spotify_id`
  FOREIGN KEY (`spotify_id`) REFERENCES `nowplaying_spotify_tracks`(`spotify_id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

