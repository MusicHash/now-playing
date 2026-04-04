import {
    parseChartId,
    parseChartWeek,
    parseDays,
    parseDevice,
    parseLimit,
    parseMetricsDrill,
    parseMomentum,
    parseBucket,
    parsePlaylistIndex,
    parsePlaylistMode,
    parsePlaylistRun,
    parsePlaylistSort,
    parsePlayType,
    parseStation,
    PLAY_TYPE_SHUFFLE,
} from './appSearchParams.js';
import {
    DEFAULT_BUCKET_MINUTES,
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    MOMENTUM_DIRECTION_DOWN,
    PLAYLIST_MODE_CHART,
    PLAYLIST_SORT_RECENT,
} from './statsApi.js';

const APP_NAME = 'Now Playing';

/**
 * @param {string} s
 * @param {number} max
 */
function truncateLabel(s, max) {
    const t = String(s).trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Build a tab/history title from the current path and query string.
 * @param {string} pathname
 * @param {string} search `location.search` including `?`
 */
export function buildDocumentTitle(pathname, search) {
    const path = pathname === '' ? '/' : pathname;
    const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

    if (path === '/') {
        return `${APP_NAME} · Home`;
    }
    if (path === '/metrics') {
        return titleMetrics(sp);
    }
    if (path === '/playlist') {
        return titlePlaylist(sp);
    }

    const seg = path.replace(/^\//, '').replace(/\//g, ' · ') || path;
    return `${APP_NAME} · ${seg}`;
}

/**
 * @param {URLSearchParams} sp
 */
function titleMetrics(sp) {
    /** @type {string[]} */
    const parts = ['Play metrics'];

    const drill = parseMetricsDrill(sp);
    if (drill) {
        if (drill.type === 'track') {
            parts.push(`Track · ${truncateLabel(drill.label, 48)}`);
        } else {
            parts.push(`Artist · ${truncateLabel(drill.label, 48)}`);
        }
    }

    const station = parseStation(sp);
    if (station) {
        parts.push(truncateLabel(station, 32));
    }

    const days = parseDays(sp);
    if (days !== DEFAULT_STATS_DAYS) {
        parts.push(`${days}d`);
    }

    const limit = parseLimit(sp);
    if (limit !== DEFAULT_STATS_LIMIT) {
        parts.push(`top ${limit}`);
    }

    if (parseMomentum(sp) === MOMENTUM_DIRECTION_DOWN) {
        parts.push('momentum ↓');
    }

    if (drill) {
        const b = parseBucket(sp);
        if (b !== DEFAULT_BUCKET_MINUTES) {
            parts.push(`${b}m bucket`);
        }
    }

    return `${parts.join(' · ')} · ${APP_NAME}`;
}

/**
 * @param {URLSearchParams} sp
 */
function titlePlaylist(sp) {
    /** @type {string[]} */
    const parts = ['Playlist'];

    const mode = parsePlaylistMode(sp);
    if (mode === PLAYLIST_MODE_CHART) {
        parts.push('chart');
        const cid = parseChartId(sp);
        if (cid) {
            parts.push(truncateLabel(cid, 40));
        }
        const week = parseChartWeek(sp);
        if (week != null) {
            parts.push(`week ${week}`);
        }
    } else {
        parts.push('play log');
    }

    const station = parseStation(sp);
    if (station) {
        parts.push(truncateLabel(station, 32));
    }

    const days = parseDays(sp);
    if (days !== DEFAULT_STATS_DAYS) {
        parts.push(`${days}d`);
    }

    const limit = parseLimit(sp);
    if (limit !== DEFAULT_STATS_LIMIT) {
        parts.push(`top ${limit}`);
    }

    if (parsePlaylistSort(sp) === PLAYLIST_SORT_RECENT) {
        parts.push('recent');
    }

    const idx = parsePlaylistIndex(sp);
    if (idx != null) {
        parts.push(`track ${idx + 1}`);
    }

    if (parsePlayType(sp) === PLAY_TYPE_SHUFFLE) {
        parts.push('shuffle');
    }

    if (parsePlaylistRun(sp)) {
        parts.push('run');
    }

    const device = parseDevice(sp);
    if (device) {
        parts.push(truncateLabel(device, 24));
    }

    return `${parts.join(' · ')} · ${APP_NAME}`;
}
