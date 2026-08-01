/**
 * HTTP_PROXY pool: comma-separated URLs, or a JSON array string.
 * Single URL without commas remains valid (one entry).
 *
 * Examples:
 *   http://127.0.0.1:8888
 *   http://proxy-a:8080,http://proxy-b:8080
 *   ["http://proxy-a:8080","http://proxy-b:8080"]
 *
 * Stations may set `proxyMatch` (e.g. `co.il`) to allowlist proxies whose hostname
 * equals or ends with that domain suffix; round-robin and retries stay in that subset.
 */

/** @type {Map<string, number>} */
const roundRobinByKey = new Map();

/**
 * @param {string} proxyUrl
 * @returns {string | undefined}
 */
function proxyHostname(proxyUrl) {
    const s = proxyUrl.trim();
    if (!s) {
        return undefined;
    }
    try {
        const u = new URL(s.includes('://') ? s : `http://${s}`);
        return u.hostname || undefined;
    } catch {
        return undefined;
    }
}

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
    const host = proxyHostname(proxyUrl);
    return host || '[proxy]';
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
 * Whether a proxy hostname matches a domain/TLD hint (e.g. `co.il` → `tomerz.co.il`).
 *
 * @param {string} hostname
 * @param {string} domainMatch
 * @returns {boolean}
 */
export function proxyHostnameMatchesDomain(hostname, domainMatch) {
    const host = hostname.trim().toLowerCase();
    const domain = domainMatch.trim().toLowerCase();
    if (!host || !domain) {
        return false;
    }
    return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Filter `HTTP_PROXY` by domain/TLD hint. Omits non-matching entries.
 *
 * @param {string | undefined} domainMatch
 * @returns {string[]}
 */
export function proxyListForDomainMatch(domainMatch) {
    const full = parseHttpProxyList();
    if (!domainMatch || !String(domainMatch).trim()) {
        return full;
    }
    const domain = String(domainMatch).trim();
    return full.filter((url) => {
        const host = proxyHostname(url);
        return host != null && proxyHostnameMatchesDomain(host, domain);
    });
}

/**
 * Next proxy for load distribution (round-robin). Undefined when unset/empty.
 *
 * @param {{ domainMatch?: string; poolKey?: string }} [options]
 *   `domainMatch` — station allowlist by hostname suffix (e.g. `co.il`); omit for full pool.
 *   `poolKey` — separate round-robin cursor per key (e.g. `station:radio-beat`).
 * @returns {string | undefined}
 */
export function pickNextHttpProxy(options = {}) {
    const poolKey = options.poolKey || 'global';
    const list = proxyListForDomainMatch(options.domainMatch);
    if (list.length === 0) {
        return undefined;
    }
    const i = (roundRobinByKey.get(poolKey) ?? 0) % list.length;
    roundRobinByKey.set(poolKey, i + 1);
    return list[i];
}
