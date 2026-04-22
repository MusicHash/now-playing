CREATE TABLE `nowplaying_spotify_track_audio_features` (
    `spotify_id` INT NOT NULL,
    `spotify_track_id` VARCHAR(60) NOT NULL COMMENT 'Spotify track id, e.g. 77KWLGuKJTk5OtE0mmQ7KT',
    `popularity` TINYINT NOT NULL COMMENT '0-100',
    `null_response` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 if audio-features fetch returned null or was skipped',
    `duration_ms` INT NOT NULL,
    `time_signature` TINYINT NOT NULL,
    `key` TINYINT NOT NULL COMMENT '-1 if no key detected, else pitch class 0-11',
    `mode` TINYINT NOT NULL COMMENT '0 minor, 1 major',
    `tempo` DOUBLE NOT NULL,
    `danceability` DOUBLE NOT NULL,
    `energy` DOUBLE NOT NULL,
    `loudness` DOUBLE NOT NULL,
    `speechiness` DOUBLE NOT NULL,
    `acousticness` DOUBLE NOT NULL,
    `instrumentalness` DOUBLE NOT NULL,
    `liveness` DOUBLE NOT NULL,
    `valence` DOUBLE NOT NULL,
    PRIMARY KEY (`spotify_id`),
    KEY `spotify_track_id` (`spotify_track_id`),
    CONSTRAINT `fk_audio_features_spotify_id`
        FOREIGN KEY (`spotify_id`) REFERENCES `nowplaying_spotify_tracks` (`spotify_id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
