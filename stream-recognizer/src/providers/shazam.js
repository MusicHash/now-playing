/**
 * Shazam recognition via npm `shazamio-core` (WASM fingerprint) + Shazam AMP discovery POST.
 * No separate API key; be gentle with request spacing to reduce 429 risk.
 */

import { readFile } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

import { pickNextHttpProxy, proxyHostForLog } from '../lib/http_proxy.js';

const require = createRequire(import.meta.url);
/** @type {string[]} */
const SHAZAM_USER_AGENTS = require('./shazam_user_agents.json');
/** @type {{ recognizeBytes: (b: Uint8Array, o?: number, s?: number) => { uri: string; samplems: number; free: () => void }[] }} */
const { recognizeBytes } = require('shazamio-core');

const SEARCH_FROM_FILE =
    'https://amp.shazam.com/discovery/v5/{language}/{endpoint_country}/{device}/-/tag' +
    '/{uuid_1}/{uuid_2}?sync=true&webv3=true&sampling=true' +
    '&connected=&shazamapiversion=v3&sharehub=true&hubv5minorversion=v5.1&hidelb=true&video=v3';

const DEFAULT_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/**
 * Random UA from bundled pool per request. `SHAZAM_USER_AGENT` forces a fixed value.
 *
 * @returns {string}
 */
function discoveryUserAgent() {
    const env = (process.env.SHAZAM_USER_AGENT || '').trim();
    if (env) {
        return env;
    }
    const n = SHAZAM_USER_AGENTS.length;
    if (n === 0) {
        return DEFAULT_UA;
    }
    return SHAZAM_USER_AGENTS[randomInt(0, n)];
}

/**
 * @returns {boolean}
 */
export function isShazamEnabled() {
    const v = (process.env.SHAZAM_DISABLED || '').trim().toLowerCase();
    return v !== '1' && v !== 'true' && v !== 'yes';
}

function envInt(name, fallback) {
    const v = process.env[name];
    if (v === undefined || v === '') {
        return fallback;
    }
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
}

/** @type {Map<string, import('undici').ProxyAgent>} */
const proxyAgentByUrl = new Map();

/**
 * @param {string | undefined} proxyUrl
 * @returns {import('undici').ProxyAgent | undefined}
 */
function getProxyDispatcher(proxyUrl) {
    if (!proxyUrl) {
        return undefined;
    }
    let agent = proxyAgentByUrl.get(proxyUrl);
    if (!agent) {
        agent = new ProxyAgent(proxyUrl);
        proxyAgentByUrl.set(proxyUrl, agent);
    }
    return agent;
}

/**
 * @param {string} url
 * @returns {string}
 */
function redactDiscoveryUrl(url) {
    return url.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '{uuid}',
    );
}

/**
 * @param {unknown} data
 * @returns {{ artist: string; title: string; key?: string } | null}
 */
function parseTrack(data) {
    if (!data || typeof data !== 'object') {
        return null;
    }
    const d = /** @type {Record<string, unknown>} */ (data);
    const direct = d.track;
    const fromMatch =
        Array.isArray(d.matches) && d.matches[0] && typeof d.matches[0] === 'object'
            ? /** @type {Record<string, unknown>} */ (d.matches[0]).track
            : null;
    const t = (direct || fromMatch) && typeof (direct || fromMatch) === 'object'
        ? /** @type {Record<string, unknown>} */ (direct || fromMatch)
        : null;
    if (!t) {
        return null;
    }
    const title = t.title != null ? String(t.title).trim() : '';
    let artist = t.subtitle != null ? String(t.subtitle).trim() : '';
    if (!artist && Array.isArray(t.sections)) {
        for (const sec of t.sections) {
            if (!sec || typeof sec !== 'object') {
                continue;
            }
            const s = /** @type {Record<string, unknown>} */ (sec);
            if (s.type !== 'SONG' || !Array.isArray(s.metadata)) {
                continue;
            }
            for (const m of s.metadata) {
                if (!m || typeof m !== 'object') {
                    continue;
                }
                const meta = /** @type {Record<string, unknown>} */ (m);
                if (
                    String(meta.title || '').toLowerCase() === 'artist' &&
                    meta.text != null
                ) {
                    artist = String(meta.text).trim();
                    break;
                }
            }
            if (artist) {
                break;
            }
        }
    }
    if (!title && !artist) {
        return null;
    }
    const key = t.key != null ? String(t.key) : undefined;
    return { artist, title, key };
}

/**
 * @param {import('pino').Logger} logger
 * @param {unknown} body
 * @param {string} reason
 */
function logNoMatch(logger, body, reason) {
    const preview =
        body !== undefined && body !== null && typeof body === 'object'
            ? JSON.stringify(body).slice(0, 4000)
            : String(body);
    logger.info(
        { reason, responsePreview: preview },
        'shazam: no usable track (set SHAZAM_DEBUG_RESPONSE=1 for full body on miss)',
    );
    if (process.env.SHAZAM_DEBUG_RESPONSE === '1') {
        try {
            logger.info(
                { full: JSON.stringify(body).slice(0, 12_000) },
                'shazam: raw response (truncated)',
            );
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {string} url
 * @param {object} json
 * @param {import('pino').Logger} logger
 * @param {string | undefined} proxyUrl
 * @param {number} segmentIndex
 * @returns {Promise<Response>}
 */
async function fetchDiscoveryOnce(url, json, logger, proxyUrl, segmentIndex) {
    const timeoutMs = envInt('SHAZAM_FETCH_TIMEOUT_MS', 28_000);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const language = (process.env.SHAZAM_LANGUAGE || 'en-US').trim();
    const endpointCountry = (process.env.SHAZAM_ENDPOINT_COUNTRY || 'GB').trim();
    const device = (process.env.SHAZAM_DEVICE || 'iphone').trim().toLowerCase();
    const ua = discoveryUserAgent();
    const dispatcher = getProxyDispatcher(proxyUrl);
    logger.info(
        {
            proxy: proxyHostForLog(proxyUrl),
            segmentIndex,
            shazamUrl: redactDiscoveryUrl(url),
            language,
            endpointCountry,
            device,
            userAgent: ua,
            viaProxy: Boolean(proxyUrl),
        },
        'shazam: discovery POST',
    );
    try {
        return await undiciFetch(url, {
            method: 'POST',
            signal: ac.signal,
            ...(dispatcher ? { dispatcher } : {}),
            headers: {
                Accept: 'application/json',
                'Accept-Language': language,
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
                'X-Shazam-Platform': (process.env.SHAZAM_PLATFORM || 'IPHONE').trim(),
                'X-Shazam-AppVersion': (process.env.SHAZAM_APP_VERSION || '14.1.0').trim(),
                'User-Agent': ua,
            },
            body: JSON.stringify(json),
        });
    } finally {
        clearTimeout(t);
    }
}

/**
 * @param {string} url
 * @param {object} json
 * @param {import('pino').Logger} logger
 * @param {string | undefined} proxyUrl
 * @param {number} segmentIndex
 * @returns {Promise<unknown>}
 */
async function postDiscovery(url, json, logger, proxyUrl, segmentIndex) {
    let res = await fetchDiscoveryOnce(url, json, logger, proxyUrl, segmentIndex);
    if (res.status === 429) {
        const retryAfter = envInt('SHAZAM_429_RETRY_MS', 2500);
        logger.warn(
            { status: res.status, retryAfterMs: retryAfter },
            'shazam: rate limited; backing off once',
        );
        await new Promise((r) => setTimeout(r, retryAfter));
        res = await fetchDiscoveryOnce(url, json, logger, proxyUrl, segmentIndex);
    }
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`shazam HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
}

/**
 * @returns {string}
 */
function buildTagUrl() {
    const language = (process.env.SHAZAM_LANGUAGE || 'en-US').trim();
    const endpointCountry = (process.env.SHAZAM_ENDPOINT_COUNTRY || 'GB').trim();
    const device = (process.env.SHAZAM_DEVICE || 'iphone').trim().toLowerCase();
    const uuid1 = randomUUID().toUpperCase();
    const uuid2 = randomUUID().toUpperCase();
    return SEARCH_FROM_FILE.replace('{language}', language)
        .replace('{endpoint_country}', endpointCountry)
        .replace('{device}', device)
        .replace('{uuid_1}', uuid1)
        .replace('{uuid_2}', uuid2);
}

/**
 * @param {string} uri
 * @param {number} samplems
 */
function buildSearchBody(uri, samplems) {
    const timezone = (process.env.SHAZAM_TIMEZONE || 'Europe/London').trim();
    return {
        timezone,
        signature: { uri, samplems },
        timestamp: Date.now(),
        context: {},
        geolocation: {},
    };
}

/**
 * Identify from a WAV (or other supported) file path.
 *
 * @param {string} wavPath
 * @param {import('pino').Logger} logger
 * @param {{ httpProxy?: string }} [options] If `httpProxy` is present (including `undefined`), use it; otherwise pick from `HTTP_PROXY` pool (round-robin). Pass the same value as ffmpeg for a given tick.
 * @returns {Promise<{ artist: string; title: string; key?: string } | null>}
 */
export async function shazamIdentifyFromFile(wavPath, logger, options = {}) {
    if (!isShazamEnabled()) {
        logger.debug('shazam: skipped (SHAZAM_DISABLED=1)');
        return null;
    }

    const proxyUrl =
        options && typeof options === 'object' && 'httpProxy' in options
            ? options.httpProxy
            : pickNextHttpProxy();

    let buffer;
    try {
        buffer = await readFile(wavPath);
    } catch (e) {
        logger.error({ err: e, wavPath }, 'shazam: failed to read audio file');
        return null;
    }

    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    /** @type {{ uri: string; samplems: number; free: () => void }[]} */
    let signatures;
    try {
        signatures = recognizeBytes(bytes);
    } catch (e) {
        logger.error({ err: e }, 'shazam: recognizeBytes failed');
        return null;
    }

    if (!Array.isArray(signatures) || signatures.length === 0) {
        logger.info({}, 'shazam: no signatures from recognizeBytes');
        return null;
    }

    const gapMs = envInt('SHAZAM_SIGNATURE_GAP_MS', 450);

    /**
     * @param {number} fromIdx
     */
    const freeRest = (fromIdx) => {
        for (let j = fromIdx; j < signatures.length; j++) {
            try {
                signatures[j].free();
            } catch {
                /* ignore */
            }
        }
    };

    for (let i = 0; i < signatures.length; i++) {
        const sig = signatures[i];
        if (i > 0 && gapMs > 0) {
            await new Promise((r) => setTimeout(r, gapMs));
        }
        let uri;
        let samplems;
        try {
            uri = sig.uri;
            samplems = sig.samplems;
        } finally {
            try {
                sig.free();
            } catch {
                /* ignore */
            }
        }

        const url = buildTagUrl();
        const body = buildSearchBody(uri, samplems);
        /** @type {unknown} */
        let data;
        try {
            data = await postDiscovery(url, body, logger, proxyUrl, i);
        } catch (e) {
            logger.error({ err: e, segmentIndex: i }, 'shazam: discovery request failed');
            continue;
        }

        const matches = data && typeof data === 'object' && 'matches' in data
            ? /** @type {Record<string, unknown>} */ (data).matches
            : null;
        if (Array.isArray(matches) && matches.length === 0) {
            logNoMatch(logger, data, `segment_${i}_empty_matches`);
            continue;
        }

        const track = parseTrack(data);
        if (track && (track.artist || track.title)) {
            freeRest(i + 1);
            return track;
        }
        logNoMatch(logger, data, `segment_${i}_unparsed`);
    }

    return null;
}
