import { getCurrentTracks } from './tracks.js';
import { updatePlayList, replacePlayList } from './playlist.js';

import { stations, charts } from '../../config/sources.js';

import logger from '../utils/logger.js';

const getChartInfo = async function (props) {
    const chartInfo = await getCurrentTracks({
        scraperProps: props.scraper,
        parserProps: props.parser,
    });

    return chartInfo;
};

const refreshAllStations = async function () {
    for (let stationIdx in stations) {
        let props = stations[stationIdx];

        getCurrentTracks({
            scraperProps: props.scraper,
            parserProps: props.parser,
        })
            .then(async (tracks) => {
                await updatePlayList(stationIdx, tracks);
            })
            .catch((error) =>
                logger.error({
                    method: 'getCurrentTracks -> refreshAllStations',
                    message: 'Failed to refresh station',
                    error,
                    metadata: {
                        stationIdx,
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
