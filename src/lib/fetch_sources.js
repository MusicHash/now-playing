import { getCurrentTracks } from './tracks.js';
import { updatePlayList, replacePlayList } from './playlist.js';

import { stations, charts } from '../../config/sources.js';

import logger from '../utils/logger.js';
import { SYSTEM_EVENTS } from '../constants/events.js';
import { DURATION } from '../constants/numbers.js';
import { hash } from '../utils/crypt.js';
import redisWrapper from '../utils/redis_wrapper.js';
import eventEmitterWrapper from '../utils/event_emitter_wrapper.js';

const didSourceChange = async function(station, response) {
    const hashKey = 'NOWPLAYNG:SORUCES:RECENT_CHANGE_BY_SOURCE';
    const hashField = station;
    const lastStationResponse = JSON.parse(await redisWrapper.getHash(hashKey, hashField));

    response = JSON.stringify(response);

    if (hash(lastStationResponse) !== hash(response)) {
        await redisWrapper.addHash(hashKey, hashField, response, DURATION.OF_1_HOUR);

        return true;
    }

    return false;
};

const getChartInfo = async function (props) {
    const chartInfo = await getCurrentTracks({
        scraperProps: props.scraper,
        parserProps: props.parser,
    });

    return chartInfo;
};

const refreshAllStations = async function () {
    for (let station in stations) {
        let props = stations[station];

        getCurrentTracks({
            scraperProps: props.scraper,
            parserProps: props.parser,
        })
            .then(async (tracks) => {
                const payload = {
                    station: station,
                    result: tracks,
                };

                const shouldSendUpdate = await didSourceChange(station, payload);

                if (shouldSendUpdate && payload?.result?.total > 0) {
                    eventEmitterWrapper.emit(SYSTEM_EVENTS.ON_STATION_TRACK_UPDATED, payload);
                }

            })
            .catch((error) =>
                logger.error({
                    method: 'getCurrentTracks -> refreshAllStations',
                    message: 'Failed to refresh station',
                    error,
                    metadata: {
                        station,
                    },
                }),
            );
    }
};

const refreshChart = async function (chartIdx) {
    let chart = charts[chartIdx];

    if (!chart) {
        logger.error({
            method: 'refreshChart',
            message: 'Chart not found',
            metadata: {
                chart,
                args: [...arguments],
            },
        });

        return Promise.reject();
    }

    logger.debug({
        method: 'refreshChart',
        error: 'Starting chart refreshing for a single chart',
        metadata: {
            chart,
            args: [...arguments],
        },
    });

    getCurrentTracks({
        scraperProps: chart.scraper,
        parserProps: chart.parser,
    })
        .then(async (tracks) => {
            await replacePlayList(chartIdx, tracks);
        })

        .catch((error) =>
            logger.error({
                method: 'refreshChart',
                message: 'Failed to refresh a chart',
                error,
                metadata: {
                    chart,
                    args: [...arguments],
                },
            }),
        );
};

const refreshChartAll = async function () {
    let delaySeconds = 60,
        chartEnumeration = 1;

    for (let chartIdx in charts) {
        let delayBySeconds = delaySeconds * chartEnumeration;

        setTimeout(() => {
            refreshChart(chartIdx);
        }, delayBySeconds * 1000);

        logger.info({
            method: 'refreshChartAll',
            message: `Queued chart ${chartIdx} for update in ${delayBySeconds}s`,
        });

        chartEnumeration++;
    }
};

export { refreshAllStations, refreshChart, refreshChartAll, getChartInfo };
