const { getCurrentTracks } = require('./tracks');
const { updatePlayList } = require('./playlist');

const sources = require('../../config/sources');

const fetchAllSources = async function () {
    let queueSources = [];

    //listofsources = {
    //    'xm-hits1': sources['xm-hits1']
    //}

    for (let sourceIdx in sources) {
        let props = sources[sourceIdx];

        getCurrentTracks({
            scraper: props.scraper,
            parser: props.parser
        })
        .then(async tracks => {
            await updatePlayList(sourceIdx, tracks);
        })
        .catch(err => console.debug(err));
    }
};


module.exports = {
    fetchAllSources,
};
