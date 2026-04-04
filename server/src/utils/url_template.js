/**
 * Interpolates date/time placeholder tokens in a URL string.
 *
 * Supported tokens:
 *   {YEAR}          – 4-digit year
 *   {MONTH}         – 2-digit month (01-12)
 *   {DAY}           – 2-digit day (01-31)
 *   {HOUR}          – 2-digit hour in 24h format (00-23)
 *   {HOUR-PREVIOUS} – 1 hour before {HOUR}, wraps at midnight
 *   {MINUTE}        – 2-digit minute (00-59)
 *
 * @param {string} url       - The URL, possibly containing {TOKEN} placeholders.
 * @param {string} [timezone='UTC'] - IANA timezone name used to resolve the tokens.
 * @returns {string}         - URL with all recognised tokens replaced.
 */
const interpolateUrl = function (url, timezone = 'UTC') {
    if (!url || !url.includes('{')) return url;

    const parts = new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        timeZone: timezone,
    })
        .formatToParts(new Date())
        .reduce((acc, p) => {
            acc[p.type] = p.value;
            return acc;
        }, Object.create(null));

    // Normalise hour – Intl can return '24' for midnight in some environments
    const hour = parts.hour === '24' ? '00' : parts.hour;
    const prevHour = String((parseInt(hour, 10) + 23) % 24).padStart(2, '0');

    return url
        .replace(/\{YEAR\}/g,          parts.year)
        .replace(/\{MONTH\}/g,         parts.month)
        .replace(/\{DAY\}/g,           parts.day)
        .replace(/\{HOUR-PREVIOUS\}/g, prevHour)
        .replace(/\{HOUR\}/g,          hour)
        .replace(/\{MINUTE\}/g,        parts.minute);
};

export { interpolateUrl };
