import { scrape, parse, setLogger } from 'scrapa';
import logger from '../utils/logger.js';

setLogger(logger);

const getCurrentTracks = async function({ scraperProps, parserProps }) {
    let scrapeResponse = await scrape({
        url: Buffer.from(scraperProps.url, 'base64').toString('ascii'),
        type: scraperProps.type,
        regExp: scraperProps.regExp,
        payload: scraperProps.payload || {},
    });

    let parsed = await parse({
        body: scrapeResponse.body(),
        type: parserProps.type,
        fields: parserProps.fields,
        options: parserProps.options
    });

    return parsed;
};


export {
    getCurrentTracks,
};
