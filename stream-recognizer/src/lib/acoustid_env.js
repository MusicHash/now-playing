/**
 * Resolve AcoustID `client` parameter (application key).
 *
 * AcoustID distinguishes:
 * - **Application API key** — register at https://acoustid.org/new-application — use for `client` on lookup.
 * - **User API key** — from https://acoustid.org/api-key after login — only for `user` on fingerprint *submit*, not for lookup.
 *
 * Using the user key in `client` yields HTTP 400, error code 4 ("invalid API key").
 */

const ENV_KEYS = [
    'ACOUSTID_CLIENT_KEY',
    'ACOUSTID_APPLICATION_KEY',
    'ACOUSTID_API_KEY',
];

function stripOuterQuotes(s) {
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
    ) {
        return s.slice(1, -1).trim();
    }
    return s;
}

/**
 * @returns {string}
 */
export function getAcoustidClientKey() {
    for (const name of ENV_KEYS) {
        const raw = process.env[name];
        if (raw === undefined || raw === '') {
            continue;
        }
        return stripOuterQuotes(String(raw).trim());
    }
    return '';
}
