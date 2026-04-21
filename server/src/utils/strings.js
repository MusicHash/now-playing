const decodeHTMLEntities = function(text) {
    var entities = [
        ['amp', '&'],
        ['apos', '\''],

        ['#x27', '\''],
        ['#x2F', '/'],
        ['#39', '\''],
        ['#47', '/'],
        ['lt', '<'],
        ['gt', '>'],
        ['nbsp', ' '],
        ['quot', '"']
    ];

    for (var i = 0, max = entities.length; i < max; ++i)
        text = text.replace(new RegExp('&' + entities[i][0] + ';', 'g'), entities[i][1]);

    return text;
};

/** Comma-like characters (ASCII + common Unicode) — Spotify search treats these poorly; use spaces so tokens stay separate. */
const COMMA_LIKE = /[\u002C\uFF0C\u201A\u060C\u3001]/g;

const cleanNames = function(text) {
    return decodeHTMLEntities(text)
        .replace(/( עם |feat\.|Ft\.|Featuring)/g, '')
        .replace(/&/g, ' ')
        .replace(COMMA_LIKE, ' ')
        .replace(/( x |-|–)/g, ' ')
        .replace(/(\/)/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s\([^)]+\)$/, '') // removes, last part (.*)$
        .trim();
};

const isNumeric = (string) => string == Number.parseFloat(string);

export {
    decodeHTMLEntities,
    cleanNames,
    isNumeric,
};
