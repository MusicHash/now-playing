import { getCurrentTracks } from './tracks.js';
import { updatePlayList, replacePlayList } from './playlist.js';

import { stations, charts } from '../../config/sources.js';

import logger from '../utils/logger.js';


const refreshAllStations = async function() {
    for (let stationIdx in stations) {
        let props = stations[stationIdx];

        getCurrentTracks({
            scraper: props.scraper,
            parser: props.parser
        })
        .then(async tracks => {
            await updatePlayList(stationIdx, tracks);
        })
        .catch(err => logger.error({
            method: 'refreshAllStations',
            error: 'Failed to refresh stations',
            message: err,
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

    getCurrentTracks({
        scraper: chart.scraper,
        parser: chart.parser
    })
    .then(async tracks => {
        await replacePlayList(chartIdx, tracks);
    })
    .catch(err => logger.error({
        method: 'refreshChart',
        error: 'Failed to refresh charts',
        message: err,
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

        logger.debug({
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
};
