/**
 * Shazam recognition via npm `shazamio-core` (WASM fingerprint) + Shazam AMP discovery POST.
 * No separate API key; be gentle with request spacing to reduce 429 risk.
 */

import { readFile } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

import {
    pickNextHttpProxy,
    proxyHostForLog,
    parseHttpProxyList,
} from '../lib/http_proxy.js';
import { SHAZAM_USER_AGENTS } from './shazam_user_agents.js';

const require = createRequire(import.meta.url);
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

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {unknown} err
 * @returns {{ type: string; message: string; code?: string }}
 */
function discoveryErrSummary(err) {
    if (!err || typeof err !== 'object') {
        return { type: typeof err, message: String(err) };
    }
    const e = /** @type {Error & { cause?: unknown; code?: string }} */ (err);
    const cause = e.cause;
    const causeObj =
        cause && typeof cause === 'object'
            ? /** @type {Error & { code?: string }} */ (cause)
            : null;
    return {
        type: e.name || 'Error',
        message: e.message || String(err),
        code: (causeObj && causeObj.code) || e.code || undefined,
    };
}

/**
 * Network / transient failures worth retrying (and often fixed by another proxy).
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetryableDiscoveryError(err) {
    if (!err || typeof err !== 'object') {
        return false;
    }
    const any = /** @type {{ name?: string; message?: string; cause?: unknown; code?: string; shazamHttpStatus?: number }} */ (
        err
    );
    if (typeof any.shazamHttpStatus === 'number') {
        return [429, 502, 503, 504].includes(any.shazamHttpStatus);
    }
    if (any.name === 'AbortError') {
        return true;
    }
    const msg = String(any.message || '').toLowerCase();
    if (msg.includes('fetch failed')) {
        return true;
    }
    const code = any.code;
    if (
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'EPIPE' ||
        code === 'ECONNREFUSED' ||
        code === 'UND_ERR_SOCKET' ||
        code === 'UND_ERR_CONNECT_TIMEOUT' ||
        code === 'UND_ERR_HEADERS_TIMEOUT' ||
        code === 'UND_ERR_BODY_TIMEOUT'
    ) {
        return true;
    }
    const c = any.cause;
    if (c && typeof c === 'object') {
        const co = /** @type {{ message?: string; code?: string; name?: string }} */ (c);
        const cm = String(co.message || '').toLowerCase();
        if (
            cm.includes('other side closed') ||
            cm.includes('econnreset') ||
            cm.includes('socket') ||
            co.name === 'SocketError'
        ) {
            return true;
        }
        if (
            co.code === 'ECONNRESET' ||
            co.code === 'ETIMEDOUT' ||
            co.code === 'UND_ERR_SOCKET'
        ) {
            return true;
        }
    }
    return false;
}

/**
 * @param {unknown} err
 * @param {object} meta
 */
function attachDiscoveryMeta(err, meta) {
    if (err && typeof err === 'object') {
        Object.assign(/** @type {object} */ (err), { discoveryMeta: meta });
    }
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
 * @typedef {{ attempt: number; max: number }} DiscoveryAttemptInfo
 */

/**
 * @param {string} url
 * @param {object} json
 * @param {import('pino').Logger} logger
 * @param {string | undefined} proxyUrl
 * @param {number} segmentIndex
 * @param {DiscoveryAttemptInfo | undefined} attemptInfo
 * @returns {Promise<Response>}
 */
async function fetchDiscoveryOnce(
    url,
    json,
    logger,
    proxyUrl,
    segmentIndex,
    attemptInfo,
) {
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
            ...(attemptInfo
                ? {
                      discoveryAttempt: attemptInfo.attempt,
                      discoveryMaxAttempts: attemptInfo.max,
                  }
                : {}),
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
 * @param {string | undefined} initialProxyUrl Same proxy as stream capture for attempt 1; later attempts advance HTTP_PROXY round-robin when a pool is configured.
 * @param {number} segmentIndex
 * @returns {Promise<unknown>}
 */
async function postDiscovery(url, json, logger, initialProxyUrl, segmentIndex) {
    const maxAttempts = Math.max(1, envInt('SHAZAM_DISCOVERY_MAX_ATTEMPTS', 3));
    const retryDelayMs = envInt('SHAZAM_DISCOVERY_RETRY_MS', 500);
    const proxyList = parseHttpProxyList();
    /** @type {string[]} */
    const proxiesTriedHosts = [];
    /** @type {unknown} */
    let lastErr;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const proxyUrl =
            attempt === 0
                ? initialProxyUrl
                : proxyList.length > 0 ? pickNextHttpProxy()
                  : initialProxyUrl;
        proxiesTriedHosts.push(proxyHostForLog(proxyUrl));
        const attemptInfo = { attempt: attempt + 1, max: maxAttempts };
        const metaBase = {
            segmentIndex,
            discoveryMaxAttempts: maxAttempts,
            discoveryAttemptsUsed: attempt + 1,
            proxiesTried: [...proxiesTriedHosts],
        };

        try {
            let res = await fetchDiscoveryOnce(
                url,
                json,
                logger,
                proxyUrl,
                segmentIndex,
                attemptInfo,
            );
            if (res.status === 429) {
                const retryAfter = envInt('SHAZAM_429_RETRY_MS', 2500);
                logger.warn(
                    {
                        status: res.status,
                        retryAfterMs: retryAfter,
                        segmentIndex,
                        discoveryAttempt: attemptInfo.attempt,
                        proxy: proxyHostForLog(proxyUrl),
                    },
                    'shazam: rate limited (429); backing off once on same proxy',
                );
                await sleep(retryAfter);
                res = await fetchDiscoveryOnce(
                    url,
                    json,
                    logger,
                    proxyUrl,
                    segmentIndex,
                    attemptInfo,
                );
            }
            if (!res.ok) {
                const text = await res.text();
                /** @type {Error & { shazamHttpStatus?: number }} */
                const httpErr = new Error(
                    `shazam HTTP ${res.status}: ${text.slice(0, 200)}`,
                );
                httpErr.shazamHttpStatus = res.status;
                lastErr = httpErr;
                const canRetry =
                    isRetryableDiscoveryError(httpErr) && attempt < maxAttempts - 1;
                if (canRetry) {
                    logger.warn(
                        {
                            segmentIndex,
                            discoveryAttempt: attemptInfo.attempt,
                            discoveryMaxAttempts: maxAttempts,
                            httpStatus: res.status,
                            proxy: proxyHostForLog(proxyUrl),
                            proxiesTried: proxiesTriedHosts,
                            errSummary: discoveryErrSummary(httpErr),
                        },
                        `shazam: discovery HTTP error; will retry (${attempt + 1}/${maxAttempts})`,
                    );
                    await sleep(Math.min(retryDelayMs * (attempt + 1), 8000));
                    continue;
                }
                attachDiscoveryMeta(httpErr, { ...metaBase, exhaustedRetries: true });
                throw httpErr;
            }
            if (attempt > 0) {
                logger.info(
                    {
                        segmentIndex,
                        discoveryAttempt: attemptInfo.attempt,
                        proxy: proxyHostForLog(proxyUrl),
                        proxiesTried: proxiesTriedHosts,
                    },
                    'shazam: discovery succeeded after retry',
                );
            }
            return res.json();
        } catch (e) {
            lastErr = e;
            const summary = discoveryErrSummary(e);
            const canRetry =
                isRetryableDiscoveryError(e) && attempt < maxAttempts - 1;
            if (!canRetry) {
                attachDiscoveryMeta(e, { ...metaBase, exhaustedRetries: true });
                throw e;
            }
            logger.warn(
                {
                    err: e,
                    segmentIndex,
                    discoveryAttempt: attemptInfo.attempt,
                    discoveryMaxAttempts: maxAttempts,
                    proxy: proxyHostForLog(proxyUrl),
                    proxiesTried: proxiesTriedHosts,
                    errSummary: summary,
                },
                `shazam: discovery transport error; will retry (${attempt + 1}/${maxAttempts})`,
            );
            await sleep(Math.min(retryDelayMs * (attempt + 1), 8000));
        }
    }
    const fin =
        lastErr instanceof Error
            ? lastErr
            : new Error('shazam: discovery exhausted attempts');
    attachDiscoveryMeta(fin, {
        segmentIndex,
        discoveryMaxAttempts: maxAttempts,
        discoveryAttemptsUsed: maxAttempts,
        proxiesTried: proxiesTriedHosts,
        exhaustedRetries: true,
    });
    throw fin;
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
 * @typedef {{ ok: true; artist: string; title: string; key?: string }} ShazamOk
 * @typedef {{ ok: false; reason: string; detail?: Record<string, unknown> }} ShazamFail
 */

/**
 * Identify from a WAV (or other supported) file path.
 *
 * @param {string} wavPath
 * @param {import('pino').Logger} logger
 * @param {{ httpProxy?: string }} [options] If `httpProxy` is present (including `undefined`), use it as the first discovery attempt; otherwise pick from `HTTP_PROXY`. Further attempts use `SHAZAM_DISCOVERY_MAX_ATTEMPTS` / `SHAZAM_DISCOVERY_RETRY_MS` and rotate the proxy pool. Pass the same value as ffmpeg for a given tick.
 * @returns {Promise<ShazamOk | ShazamFail>}
 */
export async function shazamIdentifyFromFile(wavPath, logger, options = {}) {
    if (!isShazamEnabled()) {
        logger.debug('shazam: skipped (SHAZAM_DISABLED=1)');
        return { ok: false, reason: 'disabled', detail: {} };
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
        return {
            ok: false,
            reason: 'read_file_failed',
            detail: { message: String(e?.message || e) },
        };
    }

    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    /** @type {{ uri: string; samplems: number; free: () => void }[]} */
    let signatures;
    try {
        signatures = recognizeBytes(bytes);
    } catch (e) {
        logger.error({ err: e }, 'shazam: recognizeBytes failed');
        return {
            ok: false,
            reason: 'recognize_bytes_failed',
            detail: { message: String(e?.message || e) },
        };
    }

    if (!Array.isArray(signatures) || signatures.length === 0) {
        logger.info({}, 'shazam: no signatures from recognizeBytes');
        return { ok: false, reason: 'no_signatures', detail: {} };
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

    let discoveryRequestFailures = 0;
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
            discoveryRequestFailures += 1;
            const meta =
                e && typeof e === 'object' && 'discoveryMeta' in e
                    ? /** @type {{ discoveryMeta?: Record<string, unknown> }} */ (e)
                          .discoveryMeta
                    : undefined;
            logger.error(
                {
                    err: e,
                    segmentIndex: i,
                    discoveryMeta: meta,
                },
                meta?.exhaustedRetries
                    ? 'shazam: discovery failed after retries (see discoveryMeta.proxiesTried and prior warn logs)'
                    : 'shazam: discovery request failed',
            );
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
            return { ok: true, ...track };
        }
        logNoMatch(logger, data, `segment_${i}_unparsed`);
    }

    const allSegmentsDiscoveryFailed =
        discoveryRequestFailures > 0 &&
        discoveryRequestFailures === signatures.length;
    return {
        ok: false,
        reason: allSegmentsDiscoveryFailed
            ? 'all_segments_discovery_failed'
            : 'no_usable_track_any_segment',
        detail: {
            segmentCount: signatures.length,
            discoveryRequestFailures,
        },
    };
}
