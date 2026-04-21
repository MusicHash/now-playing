-- Speed ISRC lookups for checkAndInsert and resolveCanonicalSpotifyId.
ALTER TABLE `nowplaying_spotify_tracks`
  ADD KEY `spotify_isrc` (`spotify_isrc`);
