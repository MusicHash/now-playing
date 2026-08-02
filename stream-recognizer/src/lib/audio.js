import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enrichSpawnError } from './binaries.js';

/**
 * Whether an ffmpeg capture failure is worth retrying (often another HTTP proxy fixes 403/401 from the origin).
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRetryableFfmpegStreamError(err) {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    const msg = raw.toLowerCase();
    if (
        msg.includes('403') ||
        msg.includes('401') ||
        msg.includes('407') ||
        msg.includes('forbidden') ||
        msg.includes('access denied') ||
        msg.includes('unauthorized') ||
        msg.includes('proxy authentication')
    ) {
        return true;
    }
    if (msg.includes('502') || msg.includes('503') || msg.includes('504')) {
        return true;
    }
    if (
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        msg.includes('connection refused') ||
        msg.includes('connection reset') ||
        msg.includes('econnreset')
    ) {
        return true;
    }
    return false;
}

/**
 * Max wall-clock time for stream capture: segment length + network/ffmpeg overhead.
 * Override with FFMPEG_CAPTURE_TIMEOUT_MS (milliseconds).
 */
function captureTimeoutMs(seconds) {
    const explicit = process.env.FFMPEG_CAPTURE_TIMEOUT_MS;
    if (explicit !== undefined && explicit !== '') {
        const n = Number.parseInt(explicit, 10);
        if (Number.isFinite(n) && n >= 5000) {
            return n;
        }
    }
    const overhead = Number.parseInt(
        process.env.FFMPEG_CAPTURE_OVERHEAD_MS || '45000',
        10,
    );
    const o = Number.isFinite(overhead) ? overhead : 45_000;
    return Math.max(35_000, Math.ceil(seconds) * 1000 + o);
}

/**
 * Capture N seconds to a temp WAV via ffmpeg.
 * @param {string} ffmpegBin
 * @param {string} streamUrl
 * @param {number} seconds
 * @param {{ httpProxy?: string }} [options] When set, passed to ffmpeg as `-http_proxy` (same tick as Shazam when using HTTP_PROXY pool).
 * @returns {Promise<string>} path to wav file (caller must unlink)
 */
export async function captureStreamToWav(ffmpegBin, streamUrl, seconds, options = {}) {
    const httpProxy = (options.httpProxy || '').trim() || undefined;
    const dir = await mkdtemp(join(tmpdir(), 'sr-cap-'));
    const outPath = join(dir, 'clip.wav');
    const timeoutMs = captureTimeoutMs(seconds);

    await new Promise((resolve, reject) => {
        const args = [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            ...(httpProxy ? ['-http_proxy', httpProxy] : []),
            '-i',
            streamUrl,
            '-t',
            String(seconds),
            '-ac',
            '1',
            '-ar',
            '16000',
            '-y',
            outPath,
        ];
        const p = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let err = '';
        p.stderr?.on('data', (d) => {
            err += d.toString();
        });
        const timer = setTimeout(() => {
            try {
                p.kill('SIGKILL');
            } catch {
                /* ignore */
            }
            reject(
                new Error(
                    `ffmpeg capture timed out after ${timeoutMs}ms for ${streamUrl} (stream may be DASH/HLS or unreachable; set FFMPEG_CAPTURE_TIMEOUT_MS or use a direct Icecast/MP3 URL). stderr tail: ${err.slice(-400)}`,
                ),
            );
        }, timeoutMs);
        p.on('error', (e) => {
            clearTimeout(timer);
            reject(enrichSpawnError(/** @type {NodeJS.ErrnoException} */ (e), ffmpegBin, 'FFMPEG_BIN'));
        });
        p.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `ffmpeg exit ${code} for ${streamUrl}: ${err.slice(-500)}`,
                    ),
                );
            }
        });
    });

    return outPath;
}

/**
 * Decode WAV (or any file ffmpeg understands) to s16le mono 16kHz PCM buffer.
 * @param {string} ffmpegBin
 * @param {string} filePath
 */
function decodeTimeoutMs() {
    const explicit = process.env.FFMPEG_DECODE_TIMEOUT_MS;
    if (explicit !== undefined && explicit !== '') {
        const n = Number.parseInt(explicit, 10);
        if (Number.isFinite(n) && n >= 3000) {
            return n;
        }
    }
    return 90_000;
}

export async function fileToPcm16kMono(ffmpegBin, filePath) {
    const chunks = [];
    const timeoutMs = decodeTimeoutMs();
    await new Promise((resolve, reject) => {
        const args = [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            '-i',
            filePath,
            '-f',
            's16le',
            '-ac',
            '1',
            '-ar',
            '16000',
            'pipe:1',
        ];
        const p = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        p.stdout?.on('data', (d) => chunks.push(d));
        let err = '';
        p.stderr?.on('data', (d) => {
            err += d.toString();
        });
        const timer = setTimeout(() => {
            try {
                p.kill('SIGKILL');
            } catch {
                /* ignore */
            }
            reject(new Error(`ffmpeg pcm decode timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        p.on('error', (e) => {
            clearTimeout(timer);
            reject(enrichSpawnError(/** @type {NodeJS.ErrnoException} */ (e), ffmpegBin, 'FFMPEG_BIN'));
        });
        p.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`ffmpeg pcm decode ${code}: ${err.slice(-400)}`));
            }
        });
    });
    return Buffer.concat(chunks);
}

/**
 * @param {Buffer} pcmS16le mono 16kHz
 * @param {object} opts
 * @param {number} [opts.silenceDb=-45]
 * @param {number} [opts.frameMs=30]
 * @param {number} [opts.speechRatioSkip=0.72] if fraction of "speech-like" frames exceeds this, treat as talk
 * @param {boolean} [opts.vadEnabled=true]
 * @param {number} [opts.vadAggressive=2] 0-3 scales heuristics
 */
export function analyzePcmGates(pcmS16le, opts) {
    const silenceDb = opts.silenceDb ?? -45;
    const frameMs = opts.frameMs ?? 30;
    const speechRatioSkip = opts.speechRatioSkip ?? 0.72;
    const vadEnabled = opts.vadEnabled ?? true;
    const vadAggressive = Math.min(3, Math.max(0, opts.vadAggressive ?? 2));

    const samples = new Int16Array(
        pcmS16le.buffer,
        pcmS16le.byteOffset,
        pcmS16le.byteLength / 2,
    );
    if (samples.length < 100) {
        return { silence: true, speechHeavy: false, meanDb: -100, speechFrameRatio: 0 };
    }

    const frameSamples = Math.floor((16000 * frameMs) / 1000);
    const silenceLinear = Math.pow(10, silenceDb / 20) * 32768;

    let sumSq = 0;
    let nFrames = 0;
    let speechLikeFrames = 0;
    let activeFrames = 0;

    for (let i = 0; i + frameSamples <= samples.length; i += frameSamples) {
        let s = 0;
        let zc = 0;
        for (let j = i; j < i + frameSamples; j++) {
            const v = samples[j];
            s += v * v;
            if (j > i) {
                if ((samples[j] >= 0) !== (samples[j - 1] >= 0)) {
                    zc++;
                }
            }
        }
        const rms = Math.sqrt(s / frameSamples);
        const db = 20 * Math.log10(rms / 32768 + 1e-12);
        sumSq += s;
        nFrames++;

        if (rms > silenceLinear * 0.5) {
            activeFrames++;
        }

        const zcr = zc / frameSamples;
        const midEnergy =
            rms > silenceLinear * 0.35 &&
            rms < silenceLinear * 25 &&
            db > silenceDb + 2;
        const speechish =
            midEnergy &&
            zcr > 0.12 + vadAggressive * 0.015 &&
            zcr < 0.45;
        if (speechish) {
            speechLikeFrames++;
        }
    }

    const globalRms = Math.sqrt(sumSq / samples.length);
    const meanDb = 20 * Math.log10(globalRms / 32768 + 1e-12);
    const speechFrameRatio = nFrames ? speechLikeFrames / nFrames : 0;
    const activeRatio = nFrames ? activeFrames / nFrames : 0;

    const silence =
        meanDb < silenceDb ||
        activeRatio < 0.04 ||
        globalRms < silenceLinear * 0.25;

    const strict = vadAggressive * 0.04;
    const speechHeavy =
        vadEnabled &&
        !silence &&
        speechFrameRatio > speechRatioSkip - strict;

    return {
        silence,
        speechHeavy,
        meanDb,
        speechFrameRatio,
        activeRatio,
    };
}

/**
 * Run fpcalc -json and return { fingerprint, duration }.
 * @param {string} fpcalcBin
 * @param {string} wavPath
 */
function fpcalcTimeoutMs() {
    const explicit = process.env.FPCALC_TIMEOUT_MS;
    if (explicit !== undefined && explicit !== '') {
        const n = Number.parseInt(explicit, 10);
        if (Number.isFinite(n) && n >= 3000) {
            return n;
        }
    }
    return 120_000;
}

/**
 * @param {string} out
 * @returns {{ fingerprint: string, duration: number }}
 */
function parseFpcalcJsonOutput(out) {
    let j;
    try {
        j = JSON.parse(out);
    } catch {
        throw new Error(`fpcalc: invalid JSON: ${out.slice(0, 200)}`);
    }
    const obj = Array.isArray(j) ? j[0] : j;
    const fingerprint = obj.fingerprint;
    const duration = Number(obj.duration);
    if (!fingerprint || !Number.isFinite(duration)) {
        throw new Error('fpcalc: missing fingerprint or duration');
    }
    return { fingerprint, duration };
}

/**
 * @param {string} fpcalcBin
 * @param {string[]} argvArgs fpcalc args after the binary (must end with input file path)
 */
async function runFpcalcJson(fpcalcBin, argvArgs) {
    const timeoutMs = fpcalcTimeoutMs();
    const out = await new Promise((resolve, reject) => {
        const chunks = [];
        const p = spawn(fpcalcBin, argvArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        p.stdout?.on('data', (d) => chunks.push(d));
        let err = '';
        p.stderr?.on('data', (d) => {
            err += d.toString();
        });
        const timer = setTimeout(() => {
            try {
                p.kill('SIGKILL');
            } catch {
                /* ignore */
            }
            reject(new Error(`fpcalc timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        p.on('error', (e) => {
            clearTimeout(timer);
            reject(
                enrichSpawnError(/** @type {NodeJS.ErrnoException} */ (e), fpcalcBin, 'FPCALC_BIN'),
            );
        });
        p.on('close', (code) => {
            clearTimeout(timer);
            const out = Buffer.concat(chunks).toString('utf8');
            if (code === 0) {
                resolve(out);
                return;
            }
            // Some fpcalc builds exit non-zero and print "End of file" on stderr at EOF while
            // still writing valid JSON to stdout; accept fingerprint when parseable.
            try {
                parseFpcalcJsonOutput(out);
                resolve(out);
            } catch {
                reject(new Error(`fpcalc exit ${code}: ${err.slice(-400)}`));
            }
        });
    });
    return parseFpcalcJsonOutput(out);
}

/**
 * Fingerprint a WAV (or other) file. Prefer {@link chromaprintFingerprintFromPcm} when you already
 * decoded with ffmpeg — fpcalc's WAV reader can fail on some ffmpeg outputs ("End of file" mid-decode).
 * @param {string} fpcalcBin
 * @param {string} wavPath
 */
export async function chromaprintFingerprint(fpcalcBin, wavPath) {
    return runFpcalcJson(fpcalcBin, ['-json', '-length', '120', wavPath]);
}

/**
 * Mux s16le mono 16 kHz PCM to a standard PCM WAV via ffmpeg so fpcalc reads a normal file.
 * (Direct fpcalc on raw s16le is flaky across builds; stream-capture WAVs can also confuse fpcalc.)
 * @param {string} ffmpegBin
 * @param {string} rawPath
 * @param {string} wavPath
 */
async function ffmpegPcmS16leMono16kToWav(ffmpegBin, rawPath, wavPath) {
    const timeoutMs = Math.min(decodeTimeoutMs(), 60_000);
    await new Promise((resolve, reject) => {
        const p = spawn(
            ffmpegBin,
            [
                '-hide_banner',
                '-loglevel',
                'error',
                '-nostdin',
                '-f',
                's16le',
                '-ar',
                '16000',
                '-ac',
                '1',
                '-i',
                rawPath,
                '-y',
                wavPath,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let err = '';
        p.stderr?.on('data', (d) => {
            err += d.toString();
        });
        const timer = setTimeout(() => {
            try {
                p.kill('SIGKILL');
            } catch {
                /* ignore */
            }
            reject(
                new Error(
                    `ffmpeg PCM→WAV for fpcalc timed out after ${timeoutMs}ms`,
                ),
            );
        }, timeoutMs);
        p.on('error', (e) => {
            clearTimeout(timer);
            reject(
                enrichSpawnError(/** @type {NodeJS.ErrnoException} */ (e), ffmpegBin, 'FFMPEG_BIN'),
            );
        });
        p.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `ffmpeg PCM→WAV exit ${code}: ${err.slice(-400)}`,
                    ),
                );
            }
        });
    });
}

/**
 * Fingerprint from s16le mono 16 kHz PCM (same layout as {@link fileToPcm16kMono}).
 * Muxes to a canonical WAV with ffmpeg, then runs fpcalc on that file.
 * @param {string} fpcalcBin
 * @param {string} ffmpegBin
 * @param {Buffer} pcmS16leMono16k
 */
export async function chromaprintFingerprintFromPcm(
    fpcalcBin,
    ffmpegBin,
    pcmS16leMono16k,
) {
    const minBytes = 3200;
    if (pcmS16leMono16k.byteLength < minBytes) {
        throw new Error(
            `fpcalc: PCM too short (${pcmS16leMono16k.byteLength} bytes, need at least ${minBytes})`,
        );
    }
    const dir = await mkdtemp(join(tmpdir(), 'sr-fp-'));
    const rawPath = join(dir, 'in.s16le');
    const wavPath = join(dir, 'for-fpcalc.wav');
    try {
        await writeFile(rawPath, pcmS16leMono16k);
        await ffmpegPcmS16leMono16kToWav(ffmpegBin, rawPath, wavPath);
        return await runFpcalcJson(fpcalcBin, ['-json', '-length', '120', wavPath]);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

/**
 * @param {string} dirOrFile path returned from capture (parent tmp dir)
 */
export async function cleanupCapturePath(filePath) {
    try {
        const dir = join(filePath, '..');
        await rm(dir, { recursive: true, force: true });
    } catch {
        /* ignore */
    }
}
