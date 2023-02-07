import { getCurrentTracks } from './tracks.js';
import { updatePlayList, replacePlayList } from './playlist.js';

import { stations, charts } from '../../config/sources.js';

import logger from '../utils/logger.js';


const getChartInfo = async function(props) {
    const chartInfo = await getCurrentTracks({
        scraper: props.scraper,
        parser: props.parser
    });

    return chartInfo;
};

const refreshAllStations = async function() {
    for (let stationIdx in stations) {
        let props = stations[stationIdx];

        getCurrentTracks({
            scraperProps: props.scraper,
            parserProps: props.parser
        })
        .then(async tracks => {
            await updatePlayList(stationIdx, tracks);
        })
        .catch(error => logger.error({
            method: 'refreshAllStations',
            message: 'Failed to refresh stations',
            error,
        }));
    }
};


const refreshChart = async function (chartIdx) {
    let chart = charts[chartIdx];

    if (!chart) {
        logger.error({
            method: 'refreshChart',
            message: 'Invalid chart',
            chart,
        });

        return;
    }

    logger.debug({
        method: 'refreshChart',
        error: 'Refreshing Chart started',
        chart,
    });

    getCurrentTracks({
        scraper: chart.scraper,
        parser: chart.parser
    })
    .then(async tracks => {
        await replacePlayList(chartIdx, tracks);
    })
    .catch(error => logger.error({
        method: 'refreshChart',
        message: 'Failed to refresh charts',
        error,
    }));
    
};


const refreshChartAll = async function () {
    let delaySeconds = 60,
        chartEnumeration = 1;

    for (let chartIdx in charts) {

        let delayBySeconds = (delaySeconds * chartEnumeration);

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


export {
    refreshAllStations,
    refreshChart,
    refreshChartAll,
    getChartInfo,
};
