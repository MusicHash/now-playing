import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENRES_PATH = path.join(__dirname, '../../config/spotify_genres.json');

/** @type {string[] | null} */
let cached = null;

/**
 * Sorted list of canonical track genre labels (Kaggle / Spotify taxonomy).
 * @returns {string[]}
 */
export function getTrackGenreLabels() {
    if (cached) {
        return cached;
    }
    const raw = fs.readFileSync(GENRES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        cached = [];
        return cached;
    }
    cached = [...parsed.map((g) => String(g))].sort((a, b) => a.localeCompare(b));
    return cached;
}
