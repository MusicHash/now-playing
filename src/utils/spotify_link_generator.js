import logger from './logger.js';
import Spotify from '../lib/providers/spotify.js';
/**
 * Processes an object containing a fields array and adds SPOTIFY_HYPER_LINK
 * when both title and artist fields are found
 *
 * @param {Object} data - Object containing formattedRPCInfo structure
 * @param {Array} data.fields - Array of field objects
 * @returns {Object} The modified object with SPOTIFY_HYPER_LINK fields added
 */
const addSpotifyHyperLinks = async function (data) {
    // Validate input
    if (!data || typeof data !== 'object' || !data.fields || !Array.isArray(data.fields)) {
        logger.warn({
            method: 'addSpotifyHyperLinks',
            message: 'Invalid data provided - not an object',
            metadata: {
                dataType: typeof data,
                hasFields: !!data.fields,
                fieldsType: typeof data.fields,
                isArray: Array.isArray(data.fields),
            },
        });

        return data;
    }

    logger.debug({
        method: 'addSpotifyHyperLinks',
        message: 'Processing fields for Spotify hyperlink generation',
        metadata: { fieldsCount: data.fields.length },
    });

    // Process each field in the array
    data.fields = await Promise.all(data.fields.map(async (field, index) => {
        // Check if both title and artist exist and are not empty
        const hasTitle = field.title && typeof field.title === 'string' && field.title.trim() !== '';
        const hasArtist = field.artist && typeof field.artist === 'string' && field.artist.trim() !== '';

        if (hasTitle || hasArtist) {
            // Create the search query by combining artist and title
            const searchQuery = `${field.artist} ${field.title}`.trim();

            const spotifySong = await Spotify.searchTracksWithCache(searchQuery, 1);
            const spotifySongID = spotifySong.tracks.items[0].id;
            // Create the Spotify hyperlink
            const spotifyHyperLink = `<button class="episode" data-spotify-id="spotify:episode:${spotifySongID}">${searchQuery}</button>`;

            // Add the SPOTIFY_HYPER_LINK field
            field['SPOTIFY_SEARCH_HYPER_LINK'] = spotifyHyperLink;

            return field;
        }
    }));

    return data;
};

export { addSpotifyHyperLinks };
