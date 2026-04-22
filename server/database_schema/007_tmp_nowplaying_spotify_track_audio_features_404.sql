-- Tracks that returned HTTP 404 from the audio-features sidecar (not in HF dataset).
-- Backfill batches exclude these so the same ids are not requested every run.
CREATE TABLE `tmp_nowplaying_spotify_track_audio_features_404` (
    `spotify_id` INT NOT NULL,
    `spotify_track_id` VARCHAR(60) NOT NULL,
    `notfound_timestamp` INT NOT NULL COMMENT 'Unix time when 404 was recorded',
    PRIMARY KEY (`spotify_id`),
    KEY `spotify_track_id` (`spotify_track_id`),
    CONSTRAINT `fk_audio_features_404_spotify_id`
        FOREIGN KEY (`spotify_id`) REFERENCES `nowplaying_spotify_tracks` (`spotify_id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
