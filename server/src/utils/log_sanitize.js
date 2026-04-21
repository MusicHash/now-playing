const SECRET_KEY_NORMALIZED = new Set([
    'accesstoken',
    'refreshtoken',
    'password',
    'passwd',
    'clientsecret',
    'apisecret',
    'apikey',
    'privatekey',
    'authorization',
    'idtoken',
    'bearertoken',
    'authtoken',
    'credentials',
]);

function normalizeKey(key) {
    return String(key).toLowerCase().replace(/_/g, '');
}

function isSecretKey(key) {
    const n = normalizeKey(key);
    if (SECRET_KEY_NORMALIZED.has(n)) return true;
    if (n.endsWith('secret')) return true;
    return false;
}

function maskSecretValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return '***';
    if (value.length === 0) return '***';
    return `${value.slice(0, 10)}***`;
}

export function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Deep-clone plain objects/arrays for logging and redact known secret fields (first 10 chars + "***").
 * Errors and non-plain objects are left unchanged.
 *
 * @param {*} value
 * @param {WeakSet<object>} [seen]
 * @returns {*}
 */
export function sanitizeLogValue(value, seen = new WeakSet()) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (value instanceof Error) return value;
    if (value instanceof Date) return value;

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeLogValue(item, seen));
    }

    if (!isPlainObject(value)) return value;

    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const out = {};
    for (const key of Object.keys(value)) {
        const v = value[key];
        if (isSecretKey(key)) {
            out[key] = maskSecretValue(v);
        } else {
            out[key] = sanitizeLogValue(v, seen);
        }
    }
    return out;
}
