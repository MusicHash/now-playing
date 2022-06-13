import { scrape, parse } from 'scrapa';

const getCurrentTracks = async function({ scraper, parser }) {
    let body = await scrape({
        url: Buffer.from(scraper.url, 'base64').toString('ascii'),
        type: scraper.type,
        regExp: scraper.regExp,
        payload: scraper.payload || {},
    });

    let parsed = await parse({
        body,
        type: parser.type,
        fields: parser.fields,
        options: parser.options
    });

    return parsed;
};


export {
    getCurrentTracks,
};
