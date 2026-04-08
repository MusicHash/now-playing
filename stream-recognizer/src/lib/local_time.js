/**
 * Same instant as ISO UTC, formatted in the process/OS default timezone with numeric offset
 * (e.g. `2026-04-07T19:13:39.876+03:00`).
 * @param {unknown} isoUtc
 * @returns {string|undefined}
 */
export function isoUtcToLocalOffsetIso(isoUtc) {
    if (typeof isoUtc !== 'string' || !isoUtc) {
        return undefined;
    }
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) {
        return undefined;
    }
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const y = d.getFullYear();
    const mo = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const mi = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    const msec = pad(d.getMilliseconds(), 3);
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const offH = pad(Math.floor(abs / 60));
    const offM = pad(abs % 60);
    return `${y}-${mo}-${day}T${h}:${mi}:${s}.${msec}${sign}${offH}:${offM}`;
}

/**
 * Filesystem-safe prefix matching {@link isoUtcToLocalOffsetIso} for "now" (OS local time).
 * e.g. `2026-04-07T19-13-39-876+03-00` (colons/dots replaced like legacy UTC stamps).
 * @returns {string}
 */
export function nowLocalDebugFileStamp() {
    const local = isoUtcToLocalOffsetIso(new Date().toISOString());
    if (local === undefined) {
        return new Date().toISOString().replace(/[:.]/g, '-');
    }
    return local.replace(/[:.]/g, '-');
}
