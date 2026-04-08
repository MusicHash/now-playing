import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    captureStreamToWav,
    chromaprintFingerprintFromPcm,
    analyzePcmGates,
    analyzePcmPreRecognitionEmpty,
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
import { pickNextHttpProxy, proxyHostForLog } from '../lib/http_proxy.js';
import { nowLocalDebugFileStamp } from '../lib/local_time.js';

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
 * @param {string} tickId
 * @param {string} outcome
 * @param {Record<string, unknown>} [extra]
 */
function lastRunRecord(tickId, outcome, extra = {}) {
    return {
        at: new Date().toISOString(),
        tickId,
        outcome,
        ...extra,
    };
}

/**
 * When DEBUG_CAPTURE_DIR is set and DEBUG_CAPTURE_ENABLED, copy WAV for offline analysis.
 * Filename: `{timestamp}-{stationId}-{tickId}-{label}.wav` (tickId and label sanitized for the filesystem).
 *
 * @param {string} wavPath
 * @param {string} stationId
 * @param {string} tickId
 * @param {import('pino').Logger} log
 * @param {string} label e.g. `detected-empty-peak_too_low`, `no-match`, `saved-<provider>-after-shazam-miss`
 * @param {{ artist: string; title: string }} [companionTrack] When set, also writes `{same-prefix}-{track}.txt` next to the .wav (e.g. after Shazam miss + later provider hit).
 * @returns {Promise<{ wavPath: string; companionTxtPath?: string } | undefined>}
 */
async function copyDebugWavIfEnabled(
    wavPath,
    stationId,
    tickId,
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
        const safeTick = String(tickId).replace(/[^a-zA-Z0-9_-]+/g, '-');
        const safe = String(label).replace(/[^a-zA-Z0-9_-]+/g, '-');
        const debugCopyPath = join(
            debugDir,
            `${fileStamp}-${stationId}-${safeTick}-${safe}.wav`,
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
                `${fileStamp}-${stationId}-${safeTick}-${trackSeg}.txt`,
            );
            const body = [companionTrack.artist, companionTrack.title]
                .filter(Boolean)
                .join('\n');
            try {
                await writeFile(companionTxtPath, `${body}\n`, 'utf8');
            } catch (e) {
                log.warn(
                    { err: e, companionTxtPath, station: stationId },
                    'DEBUG_CAPTURE_DIR companion .txt write failed',
                );
                companionTxtPath = undefined;
            }
        }
        return companionTxtPath
            ? { wavPath: debugCopyPath, companionTxtPath }
            : { wavPath: debugCopyPath };
    } catch (e) {
        log.warn(
            { err: e, station: stationId, debugDir },
            'DEBUG_CAPTURE_DIR copy failed',
        );
        return undefined;
    }
}

/**
 * @param {import('../types.js').StationConfig} station
 * @param {import('../lib/redis_store.js').RedisStore} store
 * @param {import('pino').Logger} logger
 * @param {{ tickId?: string }} [options]  Pass `tickId` to correlate with an external request or test.
 */
export async function runStationTick(station, store, logger, options = {}) {
    if (station.enabled === false) {
        return;
    }

    const tickId =
        typeof options.tickId === 'string' && options.tickId.trim() !== ''
            ? options.tickId.trim()
            : randomUUID();
    const log = logger.child({ tickId });
    log.info(
        { station: station.id },
        'Station Tick: START',
    );

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

    /** Same proxy for ffmpeg capture and Shazam for this tick (HTTP_PROXY pool is round-robin per tick). */
    const tickHttpProxy = pickNextHttpProxy();

    const state = await store.getState(station.id);
    const previous = state?.recognition ?? null;
    const prevKey = previous
        ? normalizeTrackKey(previous.artist, previous.title)
        : null;
    const prevFp = previous?.fingerprint || null;

    let wavPath = null;
    try {
        log.info(
            {
                station: station.id,
                captureSec,
                httpProxy: proxyHostForLog(tickHttpProxy),
            },
            'Station Tick: FFMPEG Capture Started',
        );
        wavPath = await captureStreamToWav(
            ffmpegBin,
            station.streamUrl,
            captureSec,
            { httpProxy: tickHttpProxy },
        );

        const pcm = await fileToPcm16kMono(ffmpegBin, wavPath);
        const gates = analyzePcmGates(pcm, {
            silenceDb: rmsSilenceDb,
            speechRatioSkip,
            vadEnabled,
            vadAggressive,
        });

        if (gates.silence) {
            log.debug({ station: station.id, meanDb: gates.meanDb }, 'skip: silence');
            await store.setLastRun(
                station.id,
                lastRunRecord(tickId, 'skipped_silence', { meanDb: gates.meanDb }),
            );
            return;
        }
        if (gates.speechHeavy) {
            log.debug(
                { station: station.id, speechFrameRatio: gates.speechFrameRatio },
                'skip: speech-heavy',
            );
            await store.setLastRun(
                station.id,
                lastRunRecord(tickId, 'skipped_speech_heavy', {
                    speechFrameRatio: gates.speechFrameRatio,
                }),
            );
            return;
        }

        const preEmptyEnabled = envBool('PRE_RECOGNITION_EMPTY_CHECK', true);
        if (preEmptyEnabled) {
            const minPeakDb = envFloat('PRE_RECOGNITION_MIN_PEAK_DB', -42);
            const maxSilentFrameRatio = envFloat(
                'PRE_RECOGNITION_MAX_SILENT_FRAME_RATIO',
                0.94,
            );
            const emptyProbe = analyzePcmPreRecognitionEmpty(pcm, {
                silenceDb: rmsSilenceDb,
                minPeakDb,
                maxSilentFrameRatio,
            });
            if (emptyProbe.empty) {
                const emptyLabel =
                    emptyProbe.reason != null
                        ? `detected-empty-${emptyProbe.reason}`
                        : 'detected-empty';
                const debugCopy = await copyDebugWavIfEnabled(
                    wavPath,
                    station.id,
                    tickId,
                    log,
                    emptyLabel,
                );
                const debugCopyPath = debugCopy?.wavPath;
                log.info(
                    {
                        station: station.id,
                        outcome: 'skipped_empty_segment',
                        reason: emptyProbe.reason,
                        meanDb: emptyProbe.meanDb,
                        peakDb: emptyProbe.peakDb,
                        silentFrameRatio: emptyProbe.silentFrameRatio,
                        frameCount: emptyProbe.frameCount,
                        capturePath: wavPath,
                        debugCopyPath,
                        preRecognition: {
                            minPeakDb,
                            maxSilentFrameRatio,
                            silenceDb: rmsSilenceDb,
                        },
                    },
                    'skip: segment is effectively empty (pre-recognition); not sending to fingerprint or APIs',
                );
                await store.setLastRun(
                    station.id,
                    lastRunRecord(tickId, 'skipped_empty_segment', {
                        reason: emptyProbe.reason,
                        meanDb: emptyProbe.meanDb,
                        peakDb: emptyProbe.peakDb,
                        silentFrameRatio: emptyProbe.silentFrameRatio,
                    }),
                );
                return;
            }
        }

        const { fingerprint, duration } = await chromaprintFingerprintFromPcm(
            fpcalcBin,
            ffmpegBin,
            pcm,
        );

        if (prevFp && fingerprint === prevFp) {
            log.debug(
                { station: station.id },
                'fingerprint unchanged; skip audio recognition APIs and Redis',
            );
            await store.setLastRun(
                station.id,
                lastRunRecord(tickId, 'skipped_fingerprint_unchanged'),
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
                        { station: station.id, provider: id, outcome: 'skipped' },
                        `audio recognition: ${msg}`,
                    );
                    priorSteps.push(msg);
                    continue;
                }
                const sh = await shazamIdentifyFromFile(wavPath, log, {
                    httpProxy: tickHttpProxy,
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
                        station: station.id,
                        provider: id,
                        outcome: 'no_match',
                        reason: sh.ok ? undefined : sh.reason,
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
                tickId,
                log,
                'no-match',
            );
            const debugCopyPath = debugCopy?.wavPath;
            log.info(
                {
                    station: station.id,
                    capturePath: wavPath,
                    debugCopyPath,
                    captureDurationSec: duration,
                    fingerprintLength: fingerprint.length,
                    fingerprintPrefix: fingerprint.slice(0, 72),
                    order,
                    priorSteps,
                    outcome: 'no_match_any_provider',
                },
                priorSteps.length > 0
                    ? `audio recognition: no provider identified a track. Steps: ${priorSteps.join(' ')}`
                    : 'audio recognition: no provider identified a track (nothing in AUDIO_RECOGNITION_ORDER was runnable).',
            );
            await store.setLastRun(
                station.id,
                lastRunRecord(tickId, 'no_match', {
                    priorSteps,
                    order,
                }),
            );
            return;
        }

        const key = normalizeTrackKey(match.artist, match.title);
        if (prevKey === key) {
            log.debug({ station: station.id }, 'same track key as Redis; skip write');
            await store.setLastRun(
                station.id,
                lastRunRecord(tickId, 'skipped_same_track_as_cache'),
            );
            return;
        }

        const payload = {
            artist: match.artist,
            title: match.title,
            source: matchSource,
            provider: matchSource,
            fingerprint,
            updatedAt: new Date().toISOString(),
        };
        if (matchSource === 'shazam' && match.key) {
            payload.shazamKey = match.key;
        }
        await store.mergeState(station.id, {
            recognition: payload,
            lastRun: lastRunRecord(tickId, 'saved_audio', {
                recognitionProvider: matchSource,
                provider: matchSource,
                priorSteps,
            }),
        });

        const copyDebugAfterShazamFallback =
            shazamAttemptedNoMatch && matchSource !== 'shazam';
        const sampleDebugCopy = copyDebugAfterShazamFallback
            ? await copyDebugWavIfEnabled(
                  wavPath,
                  station.id,
                  tickId,
                  log,
                  `saved-${matchSource}-after-shazam-miss`,
                  { artist: match.artist, title: match.title },
              )
            : undefined;
        const sampleWavCopyPath = sampleDebugCopy?.wavPath;
        const sampleTrackTxtPath = sampleDebugCopy?.companionTxtPath;

        const displayName = [match.artist, match.title].filter(Boolean).join(' — ');
        const winner = providerDisplayName(matchSource);

        log.info({
            station: station.id,
            source: matchSource,
            provider: matchSource,
            outcome: 'saved',
            winner,
            priorSteps,
            artist: match.artist,
            title: match.title,
            displayName,
            sampleWavCopyPath,
            sampleTrackTxtPath,
        });
    } catch (e) {
        log.error({ err: e, station: station.id }, 'station tick failed');
        try {
            await store.setLastRun(
                station.id,
                lastRunRecord(tickId, 'error', {
                    error: String(e?.message || e),
                }),
            );
        } catch {
            /* ignore redis errors */
        }
    } finally {
        if (wavPath) {
            await cleanupCapturePath(wavPath);
        }
    }
}
