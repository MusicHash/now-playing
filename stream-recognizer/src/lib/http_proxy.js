/**
 * HTTP_PROXY pool: comma-separated URLs, or a JSON array string.
 * Single URL without commas remains valid (one entry).
 *
 * Examples:
 *   http://127.0.0.1:8888
 *   http://proxy-a:8080,http://proxy-b:8080
 *   ["http://proxy-a:8080","http://proxy-b:8080"]
 *
 * Stations may set `proxyMatch` (e.g. `co.il`) to prefer proxies whose hostname
 * equals or ends with that domain suffix. The first pick stays in that subset.
 * A retry that passes `excludeHosts` skips those hosts, then uses the rest of
 * `HTTP_PROXY` once every preferred host has already been tried.
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
 * @param {string[] | undefined} hosts
 * @returns {Set<string>}
 */
function excludeHostSet(hosts) {
    /** @type {Set<string>} */
    const set = new Set();
    if (!Array.isArray(hosts)) {
        return set;
    }
    for (const host of hosts) {
        if (typeof host !== 'string') {
            continue;
        }
        const normalized = host.trim().toLowerCase();
        if (!normalized || normalized === '(direct)' || normalized === '[proxy]') {
            continue;
        }
        set.add(normalized);
    }
    return set;
}

/**
 * Next unused entry in `list`, starting at this pool's round-robin cursor.
 * Does not move the cursor when every entry is excluded.
 *
 * @param {string[]} list
 * @param {string} poolKey
 * @param {Set<string>} exclude
 * @returns {string | undefined}
 */
function pickFromList(list, poolKey, exclude) {
    if (list.length === 0) {
        return undefined;
    }
    const start = roundRobinByKey.get(poolKey) ?? 0;
    for (let step = 0; step < list.length; step++) {
        const i = (start + step) % list.length;
        const url = list[i];
        const host = proxyHostname(url);
        if (host && exclude.has(host.toLowerCase())) {
            continue;
        }
        roundRobinByKey.set(poolKey, i + 1);
        return url;
    }
    return undefined;
}

/**
 * Next proxy for load distribution (round-robin). Undefined when unset/empty.
 *
 * @param {{ domainMatch?: string; poolKey?: string; excludeHosts?: string[] }} [options]
 *   `domainMatch` — station preference by hostname suffix (e.g. `co.il`); omit for full pool.
 *   `poolKey` — separate round-robin cursor per key (e.g. `station:radio-beat`).
 *   `excludeHosts` — hostnames already tried in this retry sequence. Preferred matches
 *   are skipped first; if none remain, another host from the full pool is used.
 *   A host is repeated only after every pool host has been excluded.
 * @returns {string | undefined}
 */
export function pickNextHttpProxy(options = {}) {
    const poolKey = options.poolKey || 'global';
    const preferred = proxyListForDomainMatch(options.domainMatch);
    if (preferred.length === 0) {
        return undefined;
    }
    const exclude = excludeHostSet(options.excludeHosts);
    const fromPreferred = pickFromList(preferred, poolKey, exclude);
    if (fromPreferred) {
        return fromPreferred;
    }

    const full = parseHttpProxyList();
    const preferredIsFull =
        full.length === preferred.length &&
        full.every((url, i) => url === preferred[i]);
    if (!preferredIsFull) {
        const fromFull = pickFromList(full, poolKey, exclude);
        if (fromFull) {
            return fromFull;
        }
    }

    if (exclude.size === 0) {
        return undefined;
    }
    return pickFromList(full.length > 0 ? full : preferred, poolKey, new Set());
}
