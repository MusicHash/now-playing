CREATE TABLE `nowplaying_chart_log` (
    `chart_entry_id` INT NOT NULL AUTO_INCREMENT,
    `chart_id` VARCHAR(50) NOT NULL COMMENT 'e.g. shzm-top200-uk, billboard-hot100',
    `chart_year_week` INT NOT NULL COMMENT 'e.g. 202614 = year 2026, ISO week 14',
    `chart_position` SMALLINT NOT NULL COMMENT '1-based position in chart',
    `spotify_id` INT DEFAULT NULL COMMENT 'FK to nowplaying_spotify_tracks, NULL if not found on Spotify',
    `entry_artist` VARCHAR(300) NOT NULL,
    `entry_title` VARCHAR(300) NOT NULL,
    `entry_extra` JSON DEFAULT NULL COMMENT 'optional extra fields: label, bpm, genre, etc.',
    `entry_timestamp_fetched` INT NOT NULL,
    `entry_datetime_fetched` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`chart_entry_id`),
    UNIQUE KEY `uq_chart_week_position` (`chart_id`, `chart_year_week`, `chart_position`),
    KEY `idx_chart_year_week` (`chart_id`, `chart_year_week`),
    KEY `idx_spotify_id` (`spotify_id`),
    CONSTRAINT `fk_chart_spotify_id`
        FOREIGN KEY (`spotify_id`) REFERENCES `nowplaying_spotify_tracks`(`spotify_id`)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
