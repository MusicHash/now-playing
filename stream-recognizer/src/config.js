import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Decode `streamUrl` from stations config. Use `b64:` + standard base64 (UTF-8 URL) to avoid
 * storing plain URLs in JSON; plain `http://` / `https://` values still work.
 * @param {string} raw
 * @param {string} stationId
 * @returns {string}
 */
function decodeStreamUrl(raw, stationId) {
    if (typeof raw !== 'string' || raw === '') {
        throw new Error(`stations.${stationId}: streamUrl must be a non-empty string`);
    }
    let decoded = raw;
    if (raw.startsWith('b64:')) {
        try {
            decoded = Buffer.from(raw.slice(4), 'base64').toString('utf8');
        } catch {
            throw new Error(`stations.${stationId}: invalid base64 in streamUrl`);
        }
    }
    if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) {
        throw new Error(
            `stations.${stationId}: streamUrl must be an http(s) URL or b64:<base64-encoded URL>`,
        );
    }
    return decoded;
}

/**
 * @returns {import('./types.js').StationConfig[]}
 */
export function loadStations() {
    const path =
        process.env.STATIONS_CONFIG ||
        join(__dirname, '..', 'config', 'stations.json');
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
    ) {
        throw new Error('stations config must be a JSON object (id → station props)');
    }
    /** @type {import('./types.js').StationConfig[]} */
    const out = [];
    for (const [id, props] of Object.entries(parsed)) {
        if (props === null || typeof props !== 'object' || Array.isArray(props)) {
            throw new Error(`stations.${id}: must be an object`);
        }
        const streamUrl = decodeStreamUrl(/** @type {{ streamUrl?: string }} */ (props).streamUrl, id);
        out.push({ ...props, id, streamUrl });
    }
    return out;
}

export function envInt(name, fallback) {
    const v = process.env[name];
    if (v === undefined || v === '') {
        return fallback;
    }
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

export function envFloat(name, fallback) {
    const v = process.env[name];
    if (v === undefined || v === '') {
        return fallback;
    }
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
}

export function envBool(name, fallback) {
    const v = process.env[name];
    if (v === undefined || v === '') {
        return fallback;
    }
    return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

/** Default poll interval in ms when a station omits `intervalMs`. From `POLL_INTERVAL_SEC` (seconds). */
export function defaultPollIntervalMs() {
    return envInt('POLL_INTERVAL_SEC', 120) * 1000;
}

/**
 * Ordered provider ids tried per tick. Add new ids here and in {@link ../pipeline/orchestrator.js}
 * (and implement `src/providers/<id>.js`).
 * @returns {string[]}
 */
export function getAudioRecognitionOrder() {
    const raw = process.env.AUDIO_RECOGNITION_ORDER || 'shazam';
    const parts = raw
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const allowed = new Set(['shazam']);
    const out = [];
    for (const p of parts) {
        if (allowed.has(p) && !out.includes(p)) {
            out.push(p);
        }
    }
    if (out.length === 0) {
        return ['shazam'];
    }
    return out;
}
