import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
        out.push({ ...props, id });
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

/** @returns {('acrcloud'|'acoustid'|'shazam')[]} */
export function getAudioRecognitionOrder() {
    const raw = process.env.AUDIO_RECOGNITION_ORDER || 'acrcloud,acoustid';
    const parts = raw
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const allowed = new Set(['acrcloud', 'acoustid', 'shazam']);
    const out = [];
    for (const p of parts) {
        if (allowed.has(p) && !out.includes(p)) {
            out.push(/** @type {'acrcloud'|'acoustid'|'shazam'} */ (p));
        }
    }
    if (out.length === 0) {
        return ['acrcloud', 'acoustid'];
    }
    return out;
}
