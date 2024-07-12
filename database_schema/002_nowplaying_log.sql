CREATE TABLE `nowplaying_log`(
    `log_id` INT NOT NULL AUTO_INCREMENT,
	`spotify_id` INT NOT NULL,
    `log_station_id` VARCHAR(25) NOT NULL COMMENT 'eco99fm-live-radio',
    `log_artist` VARCHAR(150) NOT NULL,
    `log_title` VARCHAR(150) NOT NULL,
    `log_timestamp_played` INT NOT NULL,
    `log_datetime_played` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(`log_id`)
) ENGINE = InnoDB;

-- FOREIGN KEY between tables
ALTER TABLE `nowplaying_log`
  ADD CONSTRAINT `fk_spotify_id`
  FOREIGN KEY (`spotify_id`) REFERENCES `nowplaying_spotify`(`spotify_id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

