import {
    clampBucketMinutes,
    clampInt,
    DEFAULT_BUCKET_MINUTES,
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    MAX_STATS_DAYS,
    MAX_STATS_LIMIT,
    MOMENTUM_DIRECTION_DOWN,
    MOMENTUM_DIRECTION_UP,
    PLAYLIST_MODE_CHART,
    PLAYLIST_MODE_PLAYLOG,
    PLAYLIST_SORT_PLAY_COUNT,
    PLAYLIST_SORT_RECENT,
} from './statsApi.js';

/** @typedef {{ type: 'track', trackId: string, label: string } | { type: 'artist', artistName: string, label: string } | null} MetricsDrill */

/**
 * @param {URLSearchParams} sp
 * @returns {number}
 */
export function parseDays(sp) {
    return clampInt(sp.get('days'), DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
}

/**
 * @param {URLSearchParams} sp
 * @returns {number}
 */
export function parseLimit(sp) {
    return clampInt(sp.get('limit'), DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
}

/**
 * @param {URLSearchParams} sp
 * @returns {string}
 */
export function parseStation(sp) {
    const s = sp.get('station');
    return typeof s === 'string' ? s : '';
}

/**
 * @param {URLSearchParams} sp
 * @returns {typeof MOMENTUM_DIRECTION_UP | typeof MOMENTUM_DIRECTION_DOWN}
 */
export function parseMomentum(sp) {
    return sp.get('momentum') === MOMENTUM_DIRECTION_DOWN
        ? MOMENTUM_DIRECTION_DOWN
        : MOMENTUM_DIRECTION_UP;
}

/**
 * @param {URLSearchParams} sp
 * @returns {number}
 */
export function parseBucket(sp) {
    return clampBucketMinutes(sp.get('bucket'));
}

/**
 * @param {URLSearchParams} sp
 * @returns {MetricsDrill}
 */
export function parseMetricsDrill(sp) {
    const kind = sp.get('drill');
    if (kind === 'track') {
        const trackId = sp.get('trackId');
        if (typeof trackId !== 'string' || !trackId.trim()) {
            return null;
        }
        const labelRaw = sp.get('label');
        const label =
            typeof labelRaw === 'string' && labelRaw.trim()
                ? safeDecode(labelRaw.trim())
                : trackId.trim();
        return { type: 'track', trackId: trackId.trim(), label };
    }
    if (kind === 'artist') {
        const artistRaw = sp.get('artist');
        if (typeof artistRaw !== 'string' || !artistRaw.trim()) {
            return null;
        }
        const artistName = safeDecode(artistRaw.trim());
        const artistLabelRaw = sp.get('label');
        const label =
            typeof artistLabelRaw === 'string' && artistLabelRaw.trim()
                ? safeDecode(artistLabelRaw.trim())
                : artistName;
        return { type: 'artist', artistName, label };
    }
    return null;
}

/**
 * @param {string} s
 */
function safeDecode(s) {
    try {
        return decodeURIComponent(s);
    } catch {
        return s;
    }
}

/**
 * @param {URLSearchParams} base
 * @param {{
 *   days?: number,
 *   limit?: number,
 *   station?: string,
 *   momentum?: typeof MOMENTUM_DIRECTION_UP | typeof MOMENTUM_DIRECTION_DOWN,
 *   bucket?: number,
 * }} patch
 */
export function patchMetricsFilters(base, patch) {
    const next = new URLSearchParams(base);
    if (patch.days !== undefined) {
        next.set('days', String(clampInt(patch.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS)));
    }
    if (patch.limit !== undefined) {
        next.set('limit', String(clampInt(patch.limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT)));
    }
    if (patch.station !== undefined) {
        if (patch.station) {
            next.set('station', patch.station);
        } else {
            next.delete('station');
        }
    }
    if (patch.momentum !== undefined) {
        next.set('momentum', patch.momentum);
    }
    if (patch.bucket !== undefined) {
        const b = clampBucketMinutes(patch.bucket);
        if (b === DEFAULT_BUCKET_MINUTES) {
            next.delete('bucket');
        } else {
            next.set('bucket', String(b));
        }
    }
    return next;
}

/**
 * @param {URLSearchParams} base
 * @param {MetricsDrill} drill
 */
export function patchMetricsDrill(base, drill) {
    const next = new URLSearchParams(base);
    next.delete('drill');
    next.delete('trackId');
    next.delete('artist');
    next.delete('label');
    if (!drill) {
        next.delete('bucket');
        return next;
    }
    if (drill.type === 'track') {
        next.set('drill', 'track');
        next.set('trackId', drill.trackId);
        if (drill.label && drill.label !== drill.trackId) {
            next.set('label', drill.label);
        }
    } else {
        next.set('drill', 'artist');
        next.set('artist', drill.artistName);
        if (drill.label && drill.label !== drill.artistName) {
            next.set('label', drill.label);
        }
    }
    return next;
}

/**
 * @param {URLSearchParams} sp
 * @returns {string}
 */
export function parseDevice(sp) {
    const d = sp.get('device');
    return typeof d === 'string' ? d : '';
}

/**
 * @param {URLSearchParams} sp
 * @returns {typeof PLAYLIST_SORT_PLAY_COUNT | typeof PLAYLIST_SORT_RECENT}
 */
export function parsePlaylistSort(sp) {
    return sp.get('sort') === PLAYLIST_SORT_RECENT ? PLAYLIST_SORT_RECENT : PLAYLIST_SORT_PLAY_COUNT;
}

/**
 * @param {URLSearchParams} sp
 * @returns {boolean}
 */
export function parsePlaylistRun(sp) {
    return sp.get('run') === '1';
}

/**
 * @param {URLSearchParams} sp
 * @returns {typeof PLAYLIST_MODE_PLAYLOG | typeof PLAYLIST_MODE_CHART}
 */
export function parsePlaylistMode(sp) {
    return sp.get('mode') === PLAYLIST_MODE_CHART ? PLAYLIST_MODE_CHART : PLAYLIST_MODE_PLAYLOG;
}

/**
 * @param {URLSearchParams} sp
 * @returns {string}
 */
export function parseChartId(sp) {
    const c = sp.get('chart');
    return typeof c === 'string' ? c : '';
}

/**
 * @param {URLSearchParams} sp
 * @returns {number | null}
 */
export function parseChartWeek(sp) {
    const w = sp.get('week');
    if (typeof w !== 'string') return null;
    const n = Number.parseInt(w, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {URLSearchParams} base
 * @param {{
 *   days?: number,
 *   limit?: number,
 *   station?: string,
 *   sort?: typeof PLAYLIST_SORT_PLAY_COUNT | typeof PLAYLIST_SORT_RECENT,
 *   run?: boolean | null,
 *   mode?: typeof PLAYLIST_MODE_PLAYLOG | typeof PLAYLIST_MODE_CHART,
 *   chart?: string,
 *   week?: number | null,
 *   device?: string | null,
 * }} patch
 */
export function patchPlaylistState(base, patch) {
    const next = new URLSearchParams(base);
    if (patch.days !== undefined) {
        next.set('days', String(clampInt(patch.days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS)));
    }
    if (patch.limit !== undefined) {
        next.set('limit', String(clampInt(patch.limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT)));
    }
    if (patch.station !== undefined) {
        if (patch.station) {
            next.set('station', patch.station);
        } else {
            next.delete('station');
        }
    }
    if (patch.sort !== undefined) {
        next.set('sort', patch.sort);
    }
    if (patch.run !== undefined && patch.run !== null) {
        if (patch.run) {
            next.set('run', '1');
        } else {
            next.delete('run');
        }
    }
    if (patch.mode !== undefined) {
        if (patch.mode === PLAYLIST_MODE_CHART) {
            next.set('mode', PLAYLIST_MODE_CHART);
        } else {
            next.delete('mode');
        }
    }
    if (patch.chart !== undefined) {
        if (patch.chart) {
            next.set('chart', patch.chart);
        } else {
            next.delete('chart');
        }
    }
    if (patch.week !== undefined) {
        if (patch.week) {
            next.set('week', String(patch.week));
        } else {
            next.delete('week');
        }
    }
    if (patch.device !== undefined) {
        if (patch.device) {
            next.set('device', patch.device);
        } else {
            next.delete('device');
        }
    }
    return next;
}
