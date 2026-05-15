import { scrape, parse, setLogger } from 'scrapa';
import logger from '../utils/logger.js';
import { interpolateUrl } from '../utils/url_template.js';
import { resolveScraperHeaders } from '../utils/scraper_headers.js';

setLogger(logger);

/**
 * After `lines` parsing, map each raw chart row into `{ artist, title }` (optional; configured per source).
 */
const applyChartLineParse = function (parsed, parserProps) {
    const chartLineParse = parserProps?.options?.chartLineParse;
    if (!chartLineParse || !parsed?.fields?.length) {
        return parsed;
    }

    const ranked = chartLineParse.ranked instanceof RegExp
        ? chartLineParse.ranked
        : /^\d+:\s*(.+)\s+-\s+(.+)$/;
    const judgment = chartLineParse.judgment instanceof RegExp
        ? chartLineParse.judgment
        : /^לשיפוטכם:\s*(.+)\s+-\s+(.+)$/;

    const fields = [];
    for (const row of parsed.fields) {
        const line = String(row.raw ?? row.line ?? row.title ?? '').trim();
        if (!line) continue;

        const m = ranked.exec(line) || judgment.exec(line);
        if (!m) {
            continue;
        }

        fields.push({
            artist: m[1].trim(),
            title: m[2].trim(),
        });
    }

    return {
        ...parsed,
        fields,
        total: fields.length,
    };
};

const getCurrentTracks = async function ({ ID, scraperProps, parserProps }) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const decodedUrl = interpolateUrl(
                Buffer.from(scraperProps.url, 'base64').toString('ascii'),
                scraperProps.timezone,
            );

            logger.info({
                method: 'getCurrentTracks',
                message: `Attempting to scrape data (attempt ${attempt}/${maxRetries})`,
                metadata: {
                    ID,
                    url: decodedUrl,
                    type: scraperProps.type,
                },
            });

            const proxy = scraperProps.useProxy && process.env.PROXY_URI
                ? { proxy: process.env.PROXY_URI }
                : null;

            const headers = await resolveScraperHeaders(scraperProps.headers);

            let scrapeResponse = await scrape({
                url: decodedUrl,
                type: scraperProps.type,
                regExp: scraperProps.regExp,
                replacements: scraperProps.replacements || [],
                payload: scraperProps.payload || {},
                ...(headers ? { headers } : {}),
                ...proxy,
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

            parsed = applyChartLineParse(parsed, parserProps);

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
                    url: decodedUrl,
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
                        url: decodedUrl,
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
