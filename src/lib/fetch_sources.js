const { getCurrentTracks } = require('./tracks');
const { updatePlayList, replacePlayList } = require('./playlist');

const { stations, charts } = require('../../config/sources');

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


module.exports = {
    refreshAllStations,
    refreshChart
};
