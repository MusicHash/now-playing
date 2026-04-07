/**
 * ACRCloud music identification (https://www.acrcloud.com/)
 * Uses the `acrcloud` npm package (file/buffer identify).
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
/** @type {new (c: AcrConfig) => { identify: (buf: Buffer) => Promise<AcrResponse> }} */
const ACRCloud = require('acrcloud');

/**
 * @typedef {object} AcrConfig
 * @property {string} [host]
 * @property {string} access_key
 * @property {string} access_secret
 * @property {string} [data_type]
 * @property {string} [audio_format]
 * @property {string|number} [sample_rate]
 * @property {number} [audio_channels]
 */

/**
 * @typedef {object} AcrResponse
 * @property {{ code?: number; msg?: string }} [status]
 * @property {{ music?: AcrMusic[]; humming?: AcrMusic[] }} [metadata]
 * @property {number} [result_type]
 */

/**
 * @typedef {object} AcrMusic
 * @property {string} [title]
 * @property {{ name?: string }[]} [artists]
 * @property {string} [acrid]
 * @property {{ name?: string }} [album]
 */

/**
 * @param {AcrResponse | null | undefined} res
 * @returns {Record<string, unknown>}
 */
function acrNoMatchDetail(res) {
    const meta = res && typeof res === 'object' ? res.metadata : null;
    const m = meta && typeof meta === 'object' ? meta : {};
    return {
        statusCode: res?.status?.code,
        statusMsg: res?.status?.msg,
        resultType: res?.result_type,
        metadataKeys: meta ? Object.keys(meta) : [],
        musicLen: Array.isArray(m.music) ? m.music.length : 0,
        hummingLen: Array.isArray(m.humming) ? m.humming.length : 0,
    };
}

/**
 * @param {import('pino').Logger} logger
 * @param {AcrResponse | null | undefined} res
 * @param {string} reason
 */
function logAcrNoMatch(logger, res, reason) {
    logger.info(
        {
            reason,
            ...acrNoMatchDetail(res),
        },
        'acrcloud: no track (see statusMsg; set ACRCLOUD_DEBUG_RESPONSE=1 for full JSON)',
    );

    if (process.env.ACRCLOUD_DEBUG_RESPONSE === '1' && res) {
        try {
            const s = JSON.stringify(res);
            logger.info(
                { responsePreview: s.slice(0, 6000) },
                'acrcloud: raw response (truncated)',
            );
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {AcrMusic} m
 */
function pickArtistTitle(m) {
    if (!m || typeof m !== 'object') {
        return { artist: '', title: '' };
    }
    const title = m.title ? String(m.title) : '';
    let artist = '';
    if (Array.isArray(m.artists) && m.artists.length) {
        artist = m.artists
            .map((a) => `${a?.name || ''}${a?.joinphrase || ''}`)
            .join('');
    }
    return { artist, title };
}

/**
 * @returns {boolean}
 */
export function isAcrcloudConfigured() {
    const k = (process.env.ACRCLOUD_ACCESS_KEY || '').trim();
    const s = (process.env.ACRCLOUD_ACCESS_SECRET || '').trim();
    return Boolean(k && s);
}

/**
 * @typedef {{ ok: true; artist: string; title: string; acrid?: string; score?: number }} AcrOk
 * @typedef {{ ok: false; reason: string; detail?: Record<string, unknown> }} AcrFail
 */

/**
 * Identify from a WAV (or other) file path.
 *
 * @param {string} wavPath
 * @param {import('pino').Logger} logger
 * @returns {Promise<AcrOk | AcrFail>}
 */
export async function acrcloudIdentifyFromFile(wavPath, logger) {
    if (!isAcrcloudConfigured()) {
        logger.debug('ACRCloud: ACRCLOUD_ACCESS_KEY / ACRCLOUD_ACCESS_SECRET not set');
        return { ok: false, reason: 'not_configured', detail: {} };
    }

    const host =
        (process.env.ACRCLOUD_HOST || 'identify-us-west-2.acrcloud.com').trim() ||
        'identify-us-west-2.acrcloud.com';

    const access_key = (process.env.ACRCLOUD_ACCESS_KEY || '').trim();
    const access_secret = (process.env.ACRCLOUD_ACCESS_SECRET || '').trim();

    const wavAuto = process.env.ACRCLOUD_WAV_AUTO === '1';
    const sampleRate =
        (process.env.ACRCLOUD_SAMPLE_RATE || '16000').trim() || '16000';

    const acr = new ACRCloud({
        host,
        access_key,
        access_secret,
        data_type: 'audio',
        audio_format: wavAuto ? '' : 'wav',
        sample_rate: wavAuto ? '' : sampleRate,
        audio_channels: 1,
    });

    let buffer;
    try {
        buffer = await readFile(wavPath);
    } catch (e) {
        logger.error({ err: e, wavPath }, 'acrcloud: failed to read audio file');
        return {
            ok: false,
            reason: 'read_file_failed',
            detail: { message: String(e?.message || e) },
        };
    }

    /** @type {AcrResponse} */
    let res;
    try {
        res = await acr.identify(buffer);
    } catch (e) {
        logger.error({ err: e }, 'acrcloud: identify request failed');
        return {
            ok: false,
            reason: 'identify_request_failed',
            detail: { message: String(e?.message || e) },
        };
    }

    if (!res || typeof res !== 'object') {
        const reason = 'invalid_response';
        logAcrNoMatch(logger, res, reason);
        return { ok: false, reason, detail: acrNoMatchDetail(res) };
    }

    const code = res?.status?.code;
    if (code !== undefined && code !== 0) {
        const reason = `api_status_${code} (check host, keys, bucket, and console project region)`;
        logAcrNoMatch(logger, res, reason);
        return { ok: false, reason, detail: acrNoMatchDetail(res) };
    }

    const music = res?.metadata?.music;
    const humming = res?.metadata?.humming;

    /** @type {AcrMusic[] | undefined} */
    let bucket = Array.isArray(music) && music.length ? music : undefined;
    /** @type {'music'|'humming'|null} */
    let bucketName = bucket ? 'music' : null;

    if (!bucket && Array.isArray(humming) && humming.length) {
        bucket = humming;
        bucketName = 'humming';
    }

    if (!bucket || !bucket.length) {
        const reason =
            'empty_music_and_humming (clip may be ads/talk, or no catalog match; try longer CAPTURE_SECONDS)';
        logAcrNoMatch(logger, res, reason);
        return { ok: false, reason, detail: acrNoMatchDetail(res) };
    }

    const m = bucket[0];
    let { artist, title } = pickArtistTitle(m);

    if (!title && !artist) {
        const reason = `first_${bucketName}_bucket_item_has_no_title_or_artist`;
        logAcrNoMatch(logger, res, reason);
        return { ok: false, reason, detail: acrNoMatchDetail(res) };
    }

    if (bucketName === 'humming') {
        logger.info(
            { bucket: 'humming' },
            'acrcloud: match from humming bucket (enable Music bucket in console if unexpected)',
        );
    }

    return {
        ok: true,
        artist,
        title,
        acrid: m.acrid ? String(m.acrid) : undefined,
        score: typeof m.score === 'number' ? m.score : undefined,
    };
}
