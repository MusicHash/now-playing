import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enrichSpawnError } from './binaries.js';

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
 * @returns {Promise<string>} path to wav file (caller must unlink)
 */
export async function captureStreamToWav(ffmpegBin, streamUrl, seconds) {
    const dir = await mkdtemp(join(tmpdir(), 'sr-cap-'));
    const outPath = join(dir, 'clip.wav');
    const timeoutMs = captureTimeoutMs(seconds);

    await new Promise((resolve, reject) => {
        const args = [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
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
                    `ffmpeg capture timed out after ${timeoutMs}ms (stream may be DASH/HLS or unreachable; set FFMPEG_CAPTURE_TIMEOUT_MS or use a direct Icecast/MP3 URL). stderr tail: ${err.slice(-400)}`,
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
                reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`));
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

export async function chromaprintFingerprint(fpcalcBin, wavPath) {
    const timeoutMs = fpcalcTimeoutMs();
    const out = await new Promise((resolve, reject) => {
        const chunks = [];
        const p = spawn(
            fpcalcBin,
            ['-json', '-length', '120', wavPath],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
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
            if (code === 0) {
                resolve(Buffer.concat(chunks).toString('utf8'));
            } else {
                reject(new Error(`fpcalc exit ${code}: ${err.slice(-400)}`));
            }
        });
    });

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
