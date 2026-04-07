/**
 * HTTP_PROXY pool: comma-separated URLs, or a JSON array string.
 * Single URL without commas remains valid (one entry).
 *
 * Examples:
 *   http://127.0.0.1:8888
 *   http://proxy-a:8080,http://proxy-b:8080
 *   ["http://proxy-a:8080","http://proxy-b:8080"]
 */

/** @type {number} */
let roundRobinIndex = 0;

/**
 * Safe label for logs: proxy hostname only (no user, password, port, path).
 *
 * @param {string | undefined} proxyUrl
 * @returns {string}
 */
export function proxyHostForLog(proxyUrl) {
    if (!proxyUrl || typeof proxyUrl !== 'string') {
        return '(direct)';
    }
    const s = proxyUrl.trim();
    if (!s) {
        return '(direct)';
    }
    try {
        const u = new URL(s.includes('://') ? s : `http://${s}`);
        const host = u.hostname;
        return host || '[proxy]';
    } catch {
        return '[proxy]';
    }
}

/**
 * @returns {string[]}
 */
export function parseHttpProxyList() {
    const raw = (process.env.HTTP_PROXY || '').trim();
    if (!raw) {
        return [];
    }
    if (raw.startsWith('[')) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((s) => String(s).trim())
                    .filter(Boolean);
            }
        } catch {
            /* fall through */
        }
    }
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * Next proxy for load distribution (round-robin). Undefined when unset/empty.
 *
 * @returns {string | undefined}
 */
export function pickNextHttpProxy() {
    const list = parseHttpProxyList();
    if (list.length === 0) {
        return undefined;
    }
    const i = roundRobinIndex % list.length;
    roundRobinIndex += 1;
    return list[i];
}
