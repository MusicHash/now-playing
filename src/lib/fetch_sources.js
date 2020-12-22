const { getCurrentTracks } = require('./tracks');
const { updatePlayList, replacePlayList } = require('./playlist');

const { stations, charts } = require('../../config/sources');

const refreshAllStations = async function() {
    let queueSources = [];

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


const refreshAllCharts = async function () {
    let queueSources = [];

    for (let chartIdx in charts) {
        let props = charts[chartIdx];

        getCurrentTracks({
            scraper: props.scraper,
            parser: props.parser
        })
        .then(async tracks => {
            await replacePlayList(chartIdx, tracks);
        })
        .catch(err => console.debug(err));
    }
};


module.exports = {
    refreshAllStations,
    refreshAllCharts
};
