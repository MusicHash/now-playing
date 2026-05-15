import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    captureStreamToWav,
    isRetryableFfmpegStreamError,
    chromaprintFingerprintFromPcm,
    analyzePcmGates,
    fileToPcm16kMono,
    cleanupCapturePath,
} from '../lib/audio.js';
import { shazamIdentifyFromFile, isShazamEnabled } from '../providers/shazam.js';
import {
    envBool,
    envFloat,
    envInt,
    defaultPollIntervalMs,
    getAudioRecognitionOrder,
} from '../config.js';
import {
    pickNextHttpProxy,
    proxyHostForLog,
    parseHttpProxyList,
} from '../lib/http_proxy.js';
import { nowLocalDebugFileStamp } from '../lib/local_time.js';
import metrics from '../lib/metrics.js';

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleepMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} artist
 * @param {string} title
 */
export function normalizeTrackKey(artist, title) {
    const a = String(artist || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const t = String(title || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    return `${a}\t${t}`;
}

/**
 * @param {string[]|undefined|null} phrases global list from {@link ../config.js#loadRecognitionBlacklist}
 * @param {string} artist
 * @param {string} title
 * @returns {string | null} first matching blacklist phrase (trimmed), or null
 */
export function recognitionBlacklistMatch(phrases, artist, title) {
    const list = phrases;
    if (!Array.isArray(list) || list.length === 0) {
        return null;
    }
    const haystack = `${String(artist || '')} ${String(title || '')}`
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    for (const entry of list) {
        if (typeof entry !== 'string') {
            continue;
        }
        const needle = entry.toLowerCase().replace(/\s+/g, ' ').trim();
        if (needle === '') {
            continue;
        }
        if (haystack.includes(needle)) {
            return entry.trim();
        }
    }
    return null;
}

/**
 * Last path segment for DEBUG_CAPTURE_DIR companion .txt filenames (Unicode allowed).
 * @param {string} artist
 * @param {string} title
 */
export function sanitizeTrackForFilenameSegment(artist, title) {
    const raw = [artist, title].filter(Boolean).join(' ').trim();
    if (!raw) {
        return 'unknown-track';
    }
    let s = raw
        .replace(/[/\\]/g, '')
        .replace(/[\x00-\x1f<>:"|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) {
        return 'unknown-track';
    }
    if (s.length > 200) {
        s = s.slice(0, 200).trim();
    }
    return s || 'unknown-track';
}

/** @param {string} id  Provider id from {@link getAudioRecognitionOrder} */
function providerDisplayName(id) {
    if (id === 'shazam') {
        return 'Shazam';
    }
    return id;
}

/**
 * Observability only (Redis hash field `lastRun`); not used for track change detection.
 *
 * @param {string} requestID
 * @param {string} outcome
 * @param {Record<string, unknown>} [extra]
 */
function lastRunRecord(requestID, outcome, extra = {}) {
    return {
        at: new Date().toISOString(),
        requestID,
        outcome,
        ...extra,
    };
}

/**
 * When DEBUG_CAPTURE_DIR is set and DEBUG_CAPTURE_ENABLED, copy WAV for offline analysis.
 * Filename: `{timestamp}-{stationId}-{requestID}-{label}.wav` (requestID and label sanitized for the filesystem).
 *
 * @param {string} wavPath
 * @param {string} stationId
 * @param {string} requestID
 * @param {import('pino').Logger} log
 * @param {string} label e.g. `detected-empty-peak_too_low`, `no-match`, `saved-<provider>-after-shazam-miss`
 * @param {{ artist: string; title: string }} [companionTrack] When set, also writes `{same-prefix}-{track}.txt` next to the .wav (e.g. after Shazam miss + later provider hit).
 * @returns {Promise<{ wavPath: string; companionTxtPath?: string } | undefined>}
 */
async function copyDebugWavIfEnabled(
    wavPath,
    stationId,
    requestID,
    log,
    label,
    companionTrack,
) {
    const debugDir = (process.env.DEBUG_CAPTURE_DIR || '').trim();
    const debugCaptureEnabled = envBool('DEBUG_CAPTURE_ENABLED', true);
    if (!debugDir || !wavPath || !debugCaptureEnabled) {
        return undefined;
    }
    try {
        await mkdir(debugDir, { recursive: true });
        const fileStamp = nowLocalDebugFileStamp();
        const safeRequestId = String(requestID).replace(/[^a-zA-Z0-9_-]+/g, '-');
        const safe = String(label).replace(/[^a-zA-Z0-9_-]+/g, '-');
        const debugCopyPath = join(
            debugDir,
            `${fileStamp}-${stationId}-${safeRequestId}-${safe}.wav`,
        );
        await copyFile(wavPath, debugCopyPath);
        let companionTxtPath;
        if (
            companionTrack &&
            (companionTrack.artist || companionTrack.title)
        ) {
            const trackSeg = sanitizeTrackForFilenameSegment(
                companionTrack.artist,
                companionTrack.title,
            );
            companionTxtPath = join(
                debugDir,
                `${fileStamp}-${stationId}-${safeRequestId}-${trackSeg}.txt`,
            );
            const body = [companionTrack.artist, companionTrack.title]
                .filter(Boolean)
                .join('\n');
            try {
                await writeFile(companionTxtPath, `${body}\n`, 'utf8');
            } catch (e) {
                log.warn(
                    {
                        err: e,
                        metadata: { companionTxtPath, stationID: stationId },
                    },
                    'Debug capture companion txt write failed',
                );
                companionTxtPath = undefined;
            }
        }
        return companionTxtPath
            ? { wavPath: debugCopyPath, companionTxtPath }
            : { wavPath: debugCopyPath };
    } catch (e) {
        log.warn(
            { err: e, metadata: { stationID: stationId, debugDir } },
            'Debug capture WAV copy failed',
        );
        return undefined;
    }
}

/**
 * @param {import('../types.js').StationConfig} station
 * @param {import('../lib/redis_store.js').RedisStore} store
 * @param {import('pino').Logger} logger
 * @param {{ requestID?: string, recognitionBlacklist?: string[] }} [options] `recognitionBlacklist` from {@link ../config.js#loadRecognitionBlacklist}; omit to skip blacklist checks in tests.
 */
export async function runStationTick(station, store, logger, options = {}) {
    if (station.enabled === false) {
        return;
    }

    const requestID =
        typeof options.requestID === 'string' && options.requestID.trim() !== ''
            ? options.requestID.trim()
            : randomUUID();
    const recognitionBlacklistPhrases = options.recognitionBlacklist;
    const log = logger.child({ requestID, component: 'orchestrator' });
    log.info(
        { method: 'runStationTick', metadata: { stationID: station.id } },
        'Station tick started',
    );

    const tickStart = Date.now();
    /** @type {string | null} */
    let tickOutcome = null;

    const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
    const fpcalcBin = process.env.FPCALC_BIN || 'fpcalc';
    const captureSec = envInt('CAPTURE_SECONDS', 10);
    const defaultInterval = defaultPollIntervalMs();
    const intervalMs = station.intervalMs ?? defaultInterval;
    void intervalMs;

    const rmsSilenceDb = station.rmsSilenceDb ?? envFloat('RMS_SILENCE_DB', -45);
    const speechRatioSkip = envFloat('VAD_SPEECH_RATIO_SKIP', 0.72);
    const vadEnabled = envBool('VAD_ENABLED', true);
    const vadAggressive = station.vadAggressive ?? 2;

    const captureMaxAttempts = Math.max(1, envInt('FFMPEG_CAPTURE_MAX_ATTEMPTS', 3));
    const captureRetryMs = envInt('FFMPEG_CAPTURE_RETRY_MS', 500);
    const proxyList = parseHttpProxyList();
    /** Proxy used for successful capture; same value passed to Shazam first attempt. */
    let captureHttpProxy = pickNextHttpProxy();

    const state = await store.getState(station.id);
    /** Last saved track; `lastRun` must not affect duplicate / change detection. */
    const previous = state?.recognition ?? null;
    const prevKey = previous
        ? normalizeTrackKey(previous.artist, previous.title)
        : null;
    const prevMeta =
        previous?.metadata &&
        typeof previous.metadata === 'object' &&
        !Array.isArray(previous.metadata)
            ? /** @type {{ fingerprint?: unknown }} */ (previous.metadata)
            : null;
    const prevFp = (prevMeta?.fingerprint ?? previous?.fingerprint) || null;

    let wavPath = null;
    try {
        /** @type {string[]} */
        const captureProxiesTried = [];
        /** @type {unknown} */
        let lastCaptureErr;
        const captureWallStart = Date.now();
        for (let cAttempt = 0; cAttempt < captureMaxAttempts; cAttempt++) {
            const httpProxy =
                cAttempt === 0
                    ? captureHttpProxy
                    : proxyList.length > 0
                      ? pickNextHttpProxy()
                      : captureHttpProxy;
            captureProxiesTried.push(proxyHostForLog(httpProxy));
            try {
                log.info(
                    {
                        metadata: {
                            stationID: station.id,
                            captureSec,
                            captureAttempt: cAttempt + 1,
                            captureMaxAttempts,
                            httpProxy: proxyHostForLog(httpProxy),
                        },
                    },
                    'Station tick: ffmpeg capture started',
                );
                wavPath = await captureStreamToWav(
                    ffmpegBin,
                    station.streamUrl,
                    captureSec,
                    { httpProxy },
                );
                captureHttpProxy = httpProxy;
                metrics.report('StreamRecognizerCapture', [
                    {
                        key: 'durationMs',
                        value: Date.now() - captureWallStart,
                    },
                    { key: 'success', value: 1 },
                    { key: 'attempts', value: cAttempt + 1 },
                    { key: 'stationID', value: station.id },
                ]);
                if (cAttempt > 0) {
                    log.info(
                        {
                            metadata: {
                                stationID: station.id,
                                captureAttempt: cAttempt + 1,
                                httpProxy: proxyHostForLog(httpProxy),
                                captureProxiesTried,
                            },
                        },
                        'ffmpeg capture succeeded after retry',
                    );
                }
                break;
            } catch (e) {
                lastCaptureErr = e;
                const retryable = isRetryableFfmpegStreamError(e);
                if (!retryable || cAttempt === captureMaxAttempts - 1) {
                    metrics.report('StreamRecognizerCapture', [
                        {
                            key: 'durationMs',
                            value: Date.now() - captureWallStart,
                        },
                        { key: 'success', value: 0 },
                        { key: 'attempts', value: cAttempt + 1 },
                        { key: 'stationID', value: station.id },
                    ]);
                    log.error(
                        {
                            err: e,
                            metadata: {
                                stationID: station.id,
                                captureAttempt: cAttempt + 1,
                                captureMaxAttempts,
                                captureProxiesTried,
                                retryable,
                            },
                        },
                        'ffmpeg capture failed',
                    );
                    throw e;
                }
                log.warn(
                    {
                        err: e,
                        metadata: {
                            stationID: station.id,
                            captureAttempt: cAttempt + 1,
                            captureMaxAttempts,
                            httpProxy: proxyHostForLog(httpProxy),
                            captureProxiesTried,
                        },
                    },
                    'ffmpeg capture failed (retryable); retrying with next proxy',
                );
                await sleepMs(
                    Math.min(captureRetryMs * (cAttempt + 1), 8000),
                );
            }
        }
        if (!wavPath) {
            throw lastCaptureErr instanceof Error
                ? lastCaptureErr
                : new Error('ffmpeg capture exhausted attempts');
        }

        const pcm = await metrics.timeIt(
            'StreamRecognizerDecode',
            async () => fileToPcm16kMono(ffmpegBin, wavPath),
            { stationID: station.id },
        );
        const gates = analyzePcmGates(pcm, {
            silenceDb: rmsSilenceDb,
            speechRatioSkip,
            vadEnabled,
            vadAggressive,
        });

        if (gates.silence) {
            log.debug(
                { metadata: { stationID: station.id, meanDb: gates.meanDb } },
                'skip: silence',
            );
            tickOutcome = 'skipped_silence';
            await store.setLastRun(
                station.id,
                lastRunRecord(requestID, 'skipped_silence', {
                    meanDb: gates.meanDb,
                }),
            );
            return;
        }
        if (gates.speechHeavy) {
            log.debug(
                {
                    metadata: {
                        stationID: station.id,
                        speechFrameRatio: gates.speechFrameRatio,
                    },
                },
                'skip: speech-heavy',
            );
            tickOutcome = 'skipped_speech_heavy';
            await store.setLastRun(
                station.id,
                lastRunRecord(requestID, 'skipped_speech_heavy', {
                    speechFrameRatio: gates.speechFrameRatio,
                }),
            );
            return;
        }

        const { fingerprint, duration } = await metrics.timeIt(
            'StreamRecognizerFingerprint',
            async () => chromaprintFingerprintFromPcm(fpcalcBin, ffmpegBin, pcm),
            { stationID: station.id },
        );

        if (prevFp && fingerprint === prevFp) {
            log.debug(
                { metadata: { stationID: station.id } },
                'fingerprint unchanged; skip audio recognition APIs and Redis',
            );
            tickOutcome = 'skipped_fingerprint_unchanged';
            await store.setLastRun(
                station.id,
                lastRunRecord(requestID, 'skipped_fingerprint_unchanged'),
            );
            return;
        }

        const order = getAudioRecognitionOrder();

        /** @type {{ artist: string; title: string; key?: string } | null} */
        let match = null;
        /** @type {string | null} */
        let matchSource = null;

        /** @type {string[]} */
        const priorSteps = [];

        /** True when Shazam was actually called this tick and did not return a track (for DEBUG_CAPTURE_DIR). */
        let shazamAttemptedNoMatch = false;

        for (const id of order) {
            const name = providerDisplayName(id);
            if (id === 'shazam') {
                if (!isShazamEnabled()) {
                    const msg = `${name} was not used (SHAZAM_DISABLED=1).`;
                    log.info(
                        {
                            metadata: {
                                stationID: station.id,
                                provider: id,
                                outcome: 'skipped',
                            },
                        },
                        `audio recognition: ${msg}`,
                    );
                    priorSteps.push(msg);
                    continue;
                }
                const sh = await shazamIdentifyFromFile(wavPath, log, {
                    httpProxy: captureHttpProxy,
                    stationId: station.id,
                });
                if (sh.ok && (sh.artist || sh.title)) {
                    match = {
                        artist: sh.artist,
                        title: sh.title,
                        key: sh.key,
                    };
                    matchSource = 'shazam';
                    break;
                }
                shazamAttemptedNoMatch = true;
                const msg = sh.ok
                    ? `${name} did not identify a track for this capture.`
                    : `${name} did not identify (${sh.reason}).`;
                log.info(
                    {
                        metadata: {
                            stationID: station.id,
                            provider: id,
                            outcome: 'no_match',
                            ...(sh.ok ? {} : { reason: sh.reason }),
                        },
                    },
                    `audio recognition: ${msg}`,
                );
                priorSteps.push(msg);
            }
        }

        if (!match || (!match.artist && !match.title)) {
            const debugCopy = await copyDebugWavIfEnabled(
                wavPath,
                station.id,
                requestID,
                log,
                'no-match',
            );
            const debugCopyPath = debugCopy?.wavPath;
            log.info(
                {
                    metadata: {
                        stationID: station.id,
                        capturePath: wavPath,
                        debugCopyPath,
                        captureDurationSec: duration,
                        fingerprintLength: fingerprint.length,
                        fingerprintPrefix: fingerprint.slice(0, 72),
                        order,
                        priorSteps,
                        outcome: 'no_match_any_provider',
                    },
                },
                priorSteps.length > 0
                    ? `audio recognition: no provider identified a track. Steps: ${priorSteps.join(' ')}`
                    : 'audio recognition: no provider identified a track (nothing in AUDIO_RECOGNITION_ORDER was runnable).',
            );
            tickOutcome = 'no_match';
            await store.setLastRun(
                station.id,
                lastRunRecord(requestID, 'no_match', {
                    priorSteps,
                    order,
                }),
            );
            return;
        }

        const key = normalizeTrackKey(match.artist, match.title);
        const blacklistHit = recognitionBlacklistMatch(
            recognitionBlacklistPhrases,
            match.artist,
            match.title,
        );
        if (blacklistHit) {
            const displayName = [match.artist, match.title]
                .filter(Boolean)
                .join(' — ');
            log.info(
                {
                    metadata: {
                        stationID: station.id,
                        provider: matchSource,
                        outcome: 'blacklisted_skipped',
                        blacklistMatch: blacklistHit,
                        artist: match.artist,
                        title: match.title,
                        displayName,
                    },
                },
                'recognition matched global blacklist phrase; not updating recognition',
            );
            tickOutcome = 'blacklisted_skipped';
            await store.setLastRun(
                station.id,
                lastRunRecord(requestID, 'blacklisted_skipped', {
                    provider: matchSource,
                    artist: match.artist,
                    title: match.title,
                    blacklistMatch: blacklistHit,
                    priorSteps,
                }),
            );
            return;
        }

        if (prevKey === key) {
            log.debug(
                { metadata: { stationID: station.id } },
                'same track key as Redis; skip write',
            );
            tickOutcome = 'skipped_same_track_as_cache';
            await store.setLastRun(
                station.id,
                lastRunRecord(requestID, 'skipped_same_track_as_cache'),
            );
            return;
        }

        const metadata = {
            stationID: station.id,
            provider: matchSource,
            fingerprint,
            updatedAt: new Date().toISOString(),
        };
        if (matchSource === 'shazam' && match.key) {
            metadata.shazamKey = match.key;
        }
        const payload = {
            artist: match.artist,
            title: match.title,
            metadata,
        };
        await store.setResult(station.id, payload);
        await store.setLastRun(
            station.id,
            lastRunRecord(requestID, 'saved_audio', {
                provider: matchSource,
                priorSteps,
            }),
        );

        const copyDebugAfterShazamFallback =
            shazamAttemptedNoMatch && matchSource !== 'shazam';
        const sampleDebugCopy = copyDebugAfterShazamFallback
            ? await copyDebugWavIfEnabled(
                  wavPath,
                  station.id,
                  requestID,
                  log,
                  `saved-${matchSource}-after-shazam-miss`,
                  { artist: match.artist, title: match.title },
              )
            : undefined;
        const sampleWavCopyPath = sampleDebugCopy?.wavPath;
        const sampleTrackTxtPath = sampleDebugCopy?.companionTxtPath;

        const displayName = [match.artist, match.title].filter(Boolean).join(' — ');
        const winner = providerDisplayName(matchSource);

        tickOutcome = 'saved_audio';
        log.info(
            {
                method: 'runStationTick',
                metadata: {
                    stationID: station.id,
                    provider: matchSource,
                    outcome: 'saved',
                    winner,
                    priorSteps,
                    artist: match.artist,
                    title: match.title,
                    displayName,
                    sampleWavCopyPath,
                    sampleTrackTxtPath,
                },
            },
            'Recognition saved to Redis',
        );
    } catch (e) {
        tickOutcome = 'error';
        log.error(
            { err: e, metadata: { stationID: station.id } },
            'Station tick failed',
        );
        try {
            await store.setLastRun(
                station.id,
                lastRunRecord(requestID, 'error', {
                    error: String(e?.message || e),
                }),
            );
        } catch {
            /* ignore redis errors */
        }
    } finally {
        if (tickOutcome !== null) {
            metrics.report('StreamRecognizerTick', [
                {
                    key: 'durationMs',
                    value: Date.now() - tickStart,
                },
                { key: 'stationID', value: station.id },
                { key: 'outcome', value: tickOutcome },
                { key: 'success', value: tickOutcome === 'error' ? 0 : 1 },
            ]);
        }
        if (wavPath) {
            await cleanupCapturePath(wavPath);
        }
    }
}
