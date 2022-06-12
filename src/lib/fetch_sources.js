import { getCurrentTracks } from './tracks.js';
import { updatePlayList, replacePlayList } from './playlist.js';

import { stations, charts } from '../../config/sources.js';

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
        .catch(err => console.debug(err));
    }
};


const refreshChart = async function (chartIdx) {
    let chart = charts[chartIdx];

    if (!chart) {
        console.error('[refreshChart] Invalid chart:', chart);

        return;
    }

    getCurrentTracks({
        scraper: chart.scraper,
        parser: chart.parser
    })
    .then(async tracks => {
        await replacePlayList(chartIdx, tracks);
    })
    .catch(err => console.debug(err));
    
};


const refreshChartAll = async function () {
    let delaySeconds = 60,
        chartEnumeration = 1;

    for (let chartIdx in charts) {

        let delayBySeconds = (delaySeconds * chartEnumeration);

        setTimeout(() => {
            refreshChart(chartIdx);
        }, delayBySeconds * 1000);

        console.debug(`Queued chart ${chartIdx} for update in ${delayBySeconds}s`);

        chartEnumeration++;
    }
};


export {
    refreshAllStations,
    refreshChart,
    refreshChartAll,
};
