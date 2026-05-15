/**
 * Artist + title for UI. Omits the artist segment when absent (no "undefined - …").
 *
 * @param {unknown} artistRaw
 * @param {unknown} titleRaw
 * @returns {string}
 */
export function trackDisplayLabel(artistRaw, titleRaw) {
    const norm = (s) => {
        if (s == null || s === '') {
            return '';
        }
        const t = String(s).trim();
        if (t === 'undefined' || t === 'null') {
            return '';
        }
        return t;
    };
    const artist = norm(artistRaw);
    const title = norm(titleRaw);
    if (!artist) {
        return title;
    }
    if (!title) {
        return artist;
    }
    return `${artist} - ${title}`;
}
