import Spotify from '../lib/providers/spotify.js';

const PLACEHOLDER_RE = /\{([A-Z][A-Z0-9_]*)\}/g;

/**
 * Resolves `{NAME}` placeholders in scraper header values.
 * - If `process.env.NAME` is set and non-empty, that value is used.
 * - `SPOTIFY_ACCESS_TOKEN` is filled via client-credentials (after connect()).
 * @param {Record<string, string>|null|undefined} headers
 * @returns {Promise<Record<string, string>|undefined>}
 */
const resolveScraperHeaders = async function (headers) {
    if (!headers || typeof headers !== 'object') {
        return headers;
    }

    const out = {};

    for (const [key, value] of Object.entries(headers)) {
        out[key] = typeof value === 'string' ? await interpolateString(value) : value;
    }

    return out;
};

async function resolveVariable(name) {
    const fromEnv = process.env[name];
    if (fromEnv !== undefined && fromEnv !== '') {
        return fromEnv;
    }

    if (name === 'SPOTIFY_ACCESS_TOKEN') {
        await Spotify.connect();
        const token = Spotify.api.getAccessToken();
        if (!token) {
            throw new Error('SPOTIFY_ACCESS_TOKEN could not be resolved (Spotify client credentials)');
        }
        return token;
    }

    throw new Error(`Unresolved scraper header variable: {${name}}`);
}

async function interpolateString(str) {
    if (typeof str !== 'string' || !str.includes('{')) {
        return str;
    }

    const names = [...str.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
    if (names.length === 0) {
        return str;
    }

    const unique = [...new Set(names)];
    const values = await Promise.all(unique.map((n) => resolveVariable(n)));
    const map = Object.fromEntries(unique.map((n, i) => [n, values[i]]));

    return str.replace(PLACEHOLDER_RE, (_, name) => map[name]);
}

export { resolveScraperHeaders };
