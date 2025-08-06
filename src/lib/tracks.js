import { scrape, parse, setLogger } from 'scrapa';
import logger from '../utils/logger.js';

setLogger(logger);

const getCurrentTracks = async function ({ ID, scraperProps, parserProps }) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info({
                method: 'getCurrentTracks',
                message: `Attempting to scrape data (attempt ${attempt}/${maxRetries})`,
                metadata: {
                    ID,
                    url: Buffer.from(scraperProps.url, 'base64').toString('ascii'),
                    type: scraperProps.type,
                },
            });

            let scrapeResponse = await scrape({
                url: Buffer.from(scraperProps.url, 'base64').toString('ascii'),
                type: scraperProps.type,
                regExp: scraperProps.regExp,
                payload: scraperProps.payload || {},
            });

            // Validate scrape response
            if (!scrapeResponse) {
                throw new Error('Scrape response is null or undefined');
            }

            if (typeof scrapeResponse.body !== 'function') {
                throw new Error(`Invalid scrape response: body is not a function. Response type: ${typeof scrapeResponse}, keys: ${Object.keys(scrapeResponse || {})}`);
            }

            const body = scrapeResponse.body();

            if (!body) {
                throw new Error('Scrape response body is null or undefined');
            }

            logger.debug({
                method: 'getCurrentTracks',
                message: 'Successfully scraped data, parsing response',
                metadata: {
                    ID,
                    bodyLength: body.length,
                    bodyPreview: body.substring(0, 200),
                },
            });

            let parsed = await parse({
                body: body,
                type: parserProps.type,
                fields: parserProps.fields,
                options: parserProps.options,
            });

            logger.info({
                method: 'getCurrentTracks',
                message: 'Successfully parsed tracks data',
                metadata: {
                    ID,
                    responseFieldsCount: parsed?.fields?.length || 0,
                },
            });

            return parsed;
        } catch (error) {
            logger.error({
                method: 'getCurrentTracks',
                message: `Scrape attempt ${attempt}/${maxRetries} failed`,
                error,
                metadata: {
                    ID,
                    attempt,
                    maxRetries,
                    url: Buffer.from(scraperProps.url, 'base64').toString('ascii'),
                    type: scraperProps.type,
                },
            });

            // If this is the last attempt, throw the error
            if (attempt === maxRetries) {
                logger.error({
                    method: 'getCurrentTracks',
                    message: 'All scrape attempts failed, giving up',
                    error,
                    metadata: {
                        ID,
                        totalAttempts: maxRetries,
                        url: Buffer.from(scraperProps.url, 'base64').toString('ascii'),
                    },
                });
                throw error;
            }

            // Calculate delay with exponential backoff
            const delay = baseDelay * Math.pow(2, attempt - 1);
            logger.info({
                method: 'getCurrentTracks',
                message: `Retrying in ${delay}ms...`,
                metadata: {
                    ID,
                    nextAttempt: attempt + 1,
                    delay,
                },
            });

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
};

export { getCurrentTracks };
