/**
 * AcoustID v2 lookup (https://acoustid.org/webservice)
 * Commercial keys from AcoustID.biz use the same api.acoustid.org endpoint.
 *
 * Do not request `meta=compress` unless you implement gzip/base64 decoding of
 * compressed payloads — plain `recordings` matches pyacoustid defaults.
 *
 * Lookup is **duration-sensitive**: the same fingerprint with a wrong duration
 * often returns **empty results**. We try several integer second values derived
 * from fpcalc’s float duration (see `durationCandidates`).
 */

import { getAcoustidClientKey } from '../lib/acoustid_env.js';

const LOOKUP_URL = 'https://api.acoustid.org/v2/lookup';

/**
 * Integer durations to try, closest to fpcalc’s float first.
 * @param {number} rawSeconds from fpcalc JSON `duration`
 */
export function durationCandidatesForLookup(rawSeconds) {
    const raw = Number(rawSeconds);
    if (!Number.isFinite(raw) || raw <= 0) {
        return [1];
    }

    const spread = Number.parseInt(process.env.ACOUSTID_DURATION_SPREAD || '1', 10);
    const s = Number.isFinite(spread) ? Math.min(5, Math.max(0, spread)) : 1;

    const rounded = Math.max(1, Math.round(raw));
    const set = new Set([
        rounded,
        Math.max(1, Math.floor(raw)),
        Math.max(1, Math.ceil(raw)),
    ]);

    for (let d = 1; d <= s; d++) {
        set.add(Math.max(1, rounded - d));
        set.add(rounded + d);
    }

    const arr = [...set];
    arr.sort((a, b) => {
        const da = Math.abs(a - raw);
        const db = Math.abs(b - raw);
        if (da !== db) {
            return da - db;
        }
        return a - b;
    });
    return arr;
}

/**
 * @param {string} key
 * @param {string} fingerprint
 * @param {number} durationSec
 */
async function postLookup(key, fingerprint, durationSec) {
    const body = new URLSearchParams({
        client: key,
        duration: String(durationSec),
        fingerprint,
        format: 'json',
        meta: 'recordings',
    });

    const res = await fetch(LOOKUP_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body: body.toString(),
    });

    if (!res.ok) {
        const t = await res.text();
        return { ok: false, status: res.status, bodyText: t };
    }

    /** @type {any} */
    const json = await res.json();
    return { ok: true, json };
}

/**
 * @typedef {{ ok: true; artist: string; title: string; recordingId?: string; score?: number }} AcoustidOk
 * @typedef {{ ok: false; reason: string; detail?: Record<string, unknown> }} AcoustidFail
 */

/**
 * @param {object} params
 * @param {string} [params.clientKey] defaults to {@link getAcoustidClientKey}
 * @param {string} params.fingerprint
 * @param {number} params.duration fpcalc float seconds (stored as-is for candidate building)
 * @param {import('pino').Logger} params.logger
 * @returns {Promise<AcoustidOk | AcoustidFail>}
 */
export async function acoustidLookup({ clientKey, fingerprint, duration, logger }) {
    const key = (clientKey || getAcoustidClientKey()).trim();
    if (!key) {
        logger.warn(
            'No AcoustID application key (set ACOUSTID_CLIENT_KEY from https://acoustid.org/new-application)',
        );
        return { ok: false, reason: 'no_client_key', detail: {} };
    }

    const rawDur = Number(duration);
    const candidates = durationCandidatesForLookup(rawDur);

    logger.debug(
        { fpcalcDurationSeconds: rawDur, durationCandidates: candidates },
        'acoustid lookup duration candidates',
    );

    /** @type {any} */
    let lastOkJson = null;
    /** @type {number | null} */
    let lastTriedDuration = null;

    for (let i = 0; i < candidates.length; i++) {
        const durationSec = candidates[i];
        lastTriedDuration = durationSec;

        if (i > 0) {
            const gap = Number.parseInt(process.env.ACOUSTID_RETRY_DELAY_MS || '350', 10);
            const ms = Number.isFinite(gap) && gap >= 0 ? gap : 350;
            await new Promise((r) => setTimeout(r, ms));
        }

        const res = await postLookup(key, fingerprint, durationSec);

        if (!res.ok) {
            const t = res.bodyText || '';
            /** @type {{ error?: { code?: number; message?: string } }} */
            let parsed;
            try {
                parsed = JSON.parse(t);
            } catch {
                parsed = {};
            }
            const code = parsed?.error?.code;
            const msg = parsed?.error?.message;
            const log = {
                status: res.status,
                acoustidErrorCode: code,
                acoustidMessage: msg,
                body: t.slice(0, 500),
                durationSec,
            };
            if (code === 4 || msg === 'invalid API key') {
                logger.error(
                    {
                        ...log,
                        hint: 'Lookup needs the application client key from https://acoustid.org/new-application (name + version). The key at https://acoustid.org/api-key is your *user* key (for submissions only) and will not work as `client`. Commercial plans still use this application key on api.acoustid.org.',
                    },
                    'acoustid HTTP error (invalid client key)',
                );
            } else {
                logger.error(log, 'acoustid HTTP error');
            }
            return {
                ok: false,
                reason: 'lookup_http_error',
                detail: {
                    status: res.status,
                    acoustidErrorCode: code,
                    acoustidMessage: msg,
                    bodyPreview: t.slice(0, 500),
                    durationSec,
                },
            };
        }

        const json = res.json;
        lastOkJson = json;

        if (json.status !== 'ok') {
            logger.warn({ json, durationSec }, 'acoustid status not ok');
            continue;
        }

        const results = json.results;
        if (!Array.isArray(results) || results.length === 0) {
            continue;
        }

        const sorted = [...results].sort(
            (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0),
        );

        for (const r of sorted) {
            const score = Number(r.score) || 0;
            const recordings = r.recordings;
            if (!Array.isArray(recordings)) {
                continue;
            }
            for (const rec of recordings) {
                const title = pickRecordingTitle(rec);
                const artist = pickRecordingArtist(rec);
                if (!title && !artist) {
                    continue;
                }
                logger.info(
                    {
                        usedDurationSec: durationSec,
                        fpcalcDurationSeconds: rawDur,
                        score,
                    },
                    'acoustid: match',
                );
                return {
                    ok: true,
                    artist: artist || '',
                    title: title || '',
                    recordingId: rec.id,
                    score,
                };
            }
        }

        const top = sorted[0];
        const firstRec = top?.recordings?.[0];
        logger.info(
            {
                durationSec,
                fpcalcDurationSeconds: rawDur,
                topScore: top?.score,
                topId: top?.id,
                resultsCount: sorted.length,
                recordingsOnTop: Array.isArray(top?.recordings)
                    ? top.recordings.length
                    : 0,
                firstRecordingSampleKeys: firstRec
                    ? Object.keys(firstRec).slice(0, 20)
                    : [],
            },
            'acoustid: matches for this duration but no usable title/artist (check ACOUSTID_DEBUG_RESPONSE=1)',
        );

        if (process.env.ACOUSTID_DEBUG_RESPONSE === '1') {
            logger.debug(
                { responsePreview: JSON.stringify(json).slice(0, 4000) },
                'acoustid raw response (truncated)',
            );
        }

        return {
            ok: false,
            reason: 'matches_but_no_usable_title_artist',
            detail: {
                durationSec,
                fpcalcDurationSeconds: rawDur,
                topScore: top?.score,
                topId: top?.id,
                resultsCount: sorted.length,
            },
        };
    }

    logger.info(
        {
            fpcalcDurationSeconds: rawDur,
            triedDurations: candidates,
            lastTriedDuration,
            resultsLen: 0,
        },
        'acoustid: no fingerprint matches for any duration tried (clip may not be in MusicBrainz/AcoustID; try another capture during a known hit song, or a commercial ACR API for radio)',
    );

    if (process.env.ACOUSTID_DEBUG_RESPONSE === '1' && lastOkJson) {
        logger.debug(
            { responsePreview: JSON.stringify(lastOkJson).slice(0, 4000) },
            'acoustid last ok response (truncated, usually empty results)',
        );
    }

    return {
        ok: false,
        reason: 'no_fingerprint_matches_any_duration',
        detail: {
            fpcalcDurationSeconds: rawDur,
            triedDurations: candidates,
            lastTriedDuration,
        },
    };
}

/**
 * @param {any} rec
 */
function pickRecordingTitle(rec) {
    if (rec.title) {
        return String(rec.title);
    }
    if (Array.isArray(rec.tracks) && rec.tracks[0]?.title) {
        return String(rec.tracks[0].title);
    }
    if (rec.track?.title) {
        return String(rec.track.title);
    }
    return '';
}

/**
 * MusicBrainz-style artists + joinphrase (see pyacoustid parse_lookup_result).
 * @param {any} rec
 */
function pickRecordingArtist(rec) {
    if (Array.isArray(rec.artists) && rec.artists.length) {
        return rec.artists
            .map((a) => `${a.name || ''}${a.joinphrase || ''}`)
            .join('');
    }
    const ac = rec['artist-credit'];
    if (Array.isArray(ac) && ac.length) {
        return ac
            .map((x) => `${x.name || x.artist?.name || ''}${x.joinphrase || ''}`)
            .join('');
    }
    if (Array.isArray(rec.trackartists) && rec.trackartists.length) {
        return rec.trackartists
            .map((a) => `${a.name || ''}${a.joinphrase || ''}`)
            .join('');
    }
    if (Array.isArray(rec.tracks) && rec.tracks[0]?.artists?.length) {
        return rec.tracks[0].artists
            .map((a) => `${a.name || ''}${a.joinphrase || ''}`)
            .join('');
    }
    return '';
}
