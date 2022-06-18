import { scrape, parse, setLogger } from 'scrapa';
import logger from '../utils/logger.js';

setLogger(logger);

const getCurrentTracks = async function({ scraper, parser }) {
    let scrapeResponse = await scrape({
        url: Buffer.from(scraper.url, 'base64').toString('ascii'),
        type: scraper.type,
        regExp: scraper.regExp,
        payload: scraper.payload || {},
    });

    let parsed = await parse({
        body: scrapeResponse.body(),
        type: parser.type,
        fields: parser.fields,
        options: parser.options
    });

    return parsed;
};


export {
    getCurrentTracks,
};
