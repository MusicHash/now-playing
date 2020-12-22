
const charts = {
    'xm-hits1': {

        now_playing: {
            refresh_rate_ms: (35) * 1000
        },

        scraper: {
            type: 'get',
            url: '',
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'channels.hits1.content.artists.0.name',
                title: 'channels.hits1.content.title',
                album: 'channels.hits1.content.album.title'
            },
        },
    },

};

const stations = {


};

module.exports = {
    charts,
    stations
}