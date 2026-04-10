/** Zero-width / BOM characters that often differ between sources. */
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

/** Latin combining marks (after NFD). */
const LATIN_COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * NFD decomposes Hangul (and some other scripts) into Jamo — skip accent folding
 * when present so cache keys stay stable syllable-level text.
 */
const SCRIPT_SKIP_LATIN_ACCENT_FOLD =
    /[\uAC00-\uD7AF\u3040-\u30FF\u3400-\u9FFF\u0E00-\u0E7F]/u;

/**
 * Fold Latin accents (é → e). No-op for strings containing Hangul/CJK/etc.
 * @param {string} s
 * @returns {string}
 */
function foldLatinAccents(s) {
    if (SCRIPT_SKIP_LATIN_ACCENT_FOLD.test(s)) {
        return s;
    }
    return s.normalize('NFD').replace(LATIN_COMBINING_MARKS, '');
}

/** Leading / trailing quotes often differ (metadata vs UI paste). */
const OUTER_QUOTES = /^['"`\u2018\u2019\u201C\u201D]+|['"`\u2018\u2019\u201C\u201D]+$/g;

/**
 * Collaboration / credits: feat / ft / featuring / w/, or × + | • vs / versus.
 * Normalized to ` feat ` so “w/” and “feat” share the same cache key.
 * Two branches: flexible spacing around tokens, or spaced punctuation between names.
 */
const COLLAB =
    /(?:\s*(?:featuring|feat\.?|ft\.?|w\/)\s*|\s+(?:×|\+|\||•|versus|vs\.?)\s+)/gi;

/** Apostrophes are not \\p{L}; strip so “don’t” → “dont”, not “don t”. */
const APOSTROPHE_LIKE = /[''`\u2018\u2019\u201B]/g;

/**
 * Normalize a string for cache keys (e.g. Redis): strip invisible chars, NFKC,
 * lowercase, fold Latin accents (when safe), unify & and common “feat.”
 * spellings, map collab tokens to `feat`, strip outer quotes,
 * strip internal apostrophes (so contractions stay one word), then letters/digits
 * with collapsed whitespace so equivalent inputs map to one key.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeStringForCacheKey(value) {
    let s = String(value ?? '')
        .replace(ZERO_WIDTH, '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(OUTER_QUOTES, '')
        .replace(/ß/g, 'ss')
        .replace(/&/g, ' and ')
        .replace(COLLAB, ' feat ')
        // Alias typography: “a.k.a.” / “a. k. a.”
        .replace(/\ba\s*\.\s*k\s*\.\s*a\s*\./gi, ' aka ').trim();

    s = foldLatinAccents(s);

    return s
        .replace(APOSTROPHE_LIKE, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
