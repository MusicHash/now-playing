const { scrape, parse } = require('scrapa');

const getCurrentTracks = async function({ scraper, parser }) {
    let body = await scrape({
        url: Buffer.from(scraper.url, 'base64').toString('ascii'),
        type: scraper.type,
        regExp: scraper.regExp
    });

    let parsed = await parse({
        body,
        type: parser.type,
        fields: parser.fields,
        options: parser.options
    });

    return parsed;
};


module.exports = {
    getCurrentTracks,
};
