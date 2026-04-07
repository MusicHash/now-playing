import { randomUUID } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
    captureStreamToWav,
    chromaprintFingerprintFromPcm,
    analyzePcmGates,
    fileToPcm16kMono,
    cleanupCapturePath,
} from '../lib/audio.js';
import { acoustidLookup } from '../providers/acoustid.js';
import { acrcloudIdentifyFromFile, isAcrcloudConfigured } from '../providers/acrcloud.js';
import { shazamIdentifyFromFile, isShazamEnabled } from '../providers/shazam.js';
import { envBool, envFloat, envInt, getAudioRecognitionOrder } from '../config.js';
import { getAcoustidClientKey } from '../lib/acoustid_env.js';
import { pickNextHttpProxy, proxyHostForLog } from '../lib/http_proxy.js';

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

/** @param {'acrcloud'|'shazam'|'acoustid'} id */
function providerDisplayName(id) {
    if (id === 'acrcloud') {
        return 'ACRCloud';
    }
    if (id === 'shazam') {
        return 'Shazam';
    }
    return 'AcoustID';
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
        'station tick: start (use tickId in logs to correlate this run)',
    );

    const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg';
    const fpcalcBin = process.env.FPCALC_BIN || 'fpcalc';
    const captureSec = envInt('CAPTURE_SECONDS', 10);
    const defaultInterval = envInt('POLL_INTERVAL_MS', 120_000);
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
            'station tick: ffmpeg capture (see FFMPEG_CAPTURE_TIMEOUT_MS if this stalls)',
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

        /** @type {{ artist: string; title: string; acrid?: string; key?: string } | null} */
        let match = null;
        /** @type {'acrcloud' | 'acoustid' | 'shazam' | null} */
        let matchSource = null;

        /** @type {string[]} */
        const priorSteps = [];

        for (const id of order) {
            const name = providerDisplayName(id);
            if (id === 'acrcloud') {
                if (!isAcrcloudConfigured()) {
                    const msg = `${name} was not used (ACRCLOUD_ACCESS_KEY / ACRCLOUD_ACCESS_SECRET not set).`;
                    log.info(
                        { station: station.id, provider: id, outcome: 'skipped' },
                        `audio recognition: ${msg}`,
                    );
                    priorSteps.push(msg);
                    continue;
                }
                const acr = await acrcloudIdentifyFromFile(wavPath, log);
                if (acr && (acr.artist || acr.title)) {
                    match = acr;
                    matchSource = 'acrcloud';
                    break;
                }
                const msg = `${name} did not identify a track for this capture.`;
                log.info(
                    { station: station.id, provider: id, outcome: 'no_match' },
                    `audio recognition: ${msg}`,
                );
                priorSteps.push(msg);
            }
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
                if (sh && (sh.artist || sh.title)) {
                    match = sh;
                    matchSource = 'shazam';
                    break;
                }
                const msg = `${name} did not identify a track for this capture.`;
                log.info(
                    { station: station.id, provider: id, outcome: 'no_match' },
                    `audio recognition: ${msg}`,
                );
                priorSteps.push(msg);
            }
            if (id === 'acoustid') {
                const clientKey = getAcoustidClientKey();
                if (!clientKey) {
                    const msg = `${name} was not used (no ACOUSTID_CLIENT_KEY).`;
                    log.info(
                        { station: station.id, provider: id, outcome: 'skipped' },
                        `audio recognition: ${msg}`,
                    );
                    priorSteps.push(msg);
                    continue;
                }
                const ac = await acoustidLookup({
                    clientKey,
                    fingerprint,
                    duration,
                    logger: log,
                });
                if (ac && (ac.artist || ac.title)) {
                    match = ac;
                    matchSource = 'acoustid';
                    break;
                }
                const msg = `${name} did not identify a track for this capture.`;
                log.info(
                    { station: station.id, provider: id, outcome: 'no_match' },
                    `audio recognition: ${msg}`,
                );
                priorSteps.push(msg);
            }
        }

        if (!match || (!match.artist && !match.title)) {
            /** @type {string|undefined} */
            let debugCopyPath;
            const debugDir = (process.env.DEBUG_CAPTURE_DIR || '').trim();
            if (debugDir && wavPath) {
                try {
                    await mkdir(debugDir, { recursive: true });
                    debugCopyPath = join(
                        debugDir,
                        `${station.id}-${Date.now()}.wav`,
                    );
                    await copyFile(wavPath, debugCopyPath);
                } catch (e) {
                    log.warn(
                        { err: e, station: station.id, debugDir },
                        'DEBUG_CAPTURE_DIR copy failed',
                    );
                }
            }
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

        const providerLabel =
            matchSource === 'acrcloud'
                ? 'acrcloud'
                : matchSource === 'shazam'
                  ? 'shazam'
                  : 'acoustid.org';

        const payload = {
            artist: match.artist,
            title: match.title,
            source: matchSource,
            provider: providerLabel,
            fingerprint,
            updatedAt: new Date().toISOString(),
        };
        if (matchSource === 'acrcloud' && match.acrid) {
            payload.acrid = match.acrid;
        }
        if (matchSource === 'shazam' && match.key) {
            payload.shazamKey = match.key;
        }
        await store.mergeState(station.id, {
            recognition: payload,
            lastRun: lastRunRecord(tickId, 'saved_audio', {
                recognitionProvider: matchSource,
                provider: providerLabel,
                priorSteps,
            }),
        });
        const displayName = [match.artist, match.title].filter(Boolean).join(' — ');
        const winner = providerDisplayName(
            /** @type {'acrcloud' | 'shazam' | 'acoustid'} */ (matchSource),
        );
        const priorSummary =
            priorSteps.length > 0
                ? ` Earlier steps: ${priorSteps.join(' ')}`
                : '';
        log.info(
            {
                station: station.id,
                source: matchSource,
                provider: providerLabel,
                outcome: 'saved',
                recognitionWinner: matchSource,
                priorSteps,
                artist: match.artist,
                title: match.title,
            },
            `audio recognition: ${winner} identified the track and saved it to Redis.${priorSummary}` +
                (displayName ? ` Track: ${displayName}.` : ''),
        );
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
