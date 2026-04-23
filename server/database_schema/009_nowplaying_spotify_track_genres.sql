CREATE TABLE `nowplaying_spotify_track_genres` (
    `spotify_id` INT NOT NULL,
    `spotify_track_id` VARCHAR(60) NOT NULL COMMENT 'Spotify track id, e.g. 77KWLGuKJTk5OtE0mmQ7KT',
    `genre` VARCHAR(150) NOT NULL COMMENT 'Kaggle track_genre label',
    PRIMARY KEY (`spotify_id`, `genre`),
    KEY `spotify_track_id` (`spotify_track_id`),
    KEY `genre` (`genre`),
    CONSTRAINT `fk_track_genres_spotify_id`
        FOREIGN KEY (`spotify_id`) REFERENCES `nowplaying_spotify_tracks` (`spotify_id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
