
// Charts
const shzmCharts = {
    'shzm-rising-uk': {
        spotify: {
            playlist: 'https://spoti.fi/2WGAow0',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zaGF6YW0vdjMvZW4tVVMvSUwvd2ViLy0vdHJhY2tzL3Jpc2Vycy1jb3VudHJ5LWNoYXJ0LUdCP3BhZ2VTaXplPTIwJnN0YXJ0RnJvbT0w',
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.alias',
                title: 'tracks.{Iterator}.title'
            },
        },
    },


    'shzm-top200-uk': {
        spotify: {
            playlist: 'https://spoti.fi/2KQmXXo',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zaGF6YW0vdjMvZW4tVVMvSUwvd2ViLy0vdHJhY2tzL2lwLWNvdW50cnktY2hhcnQtR0I/cGFnZVNpemU9MjAwJnN0YXJ0RnJvbT0w',
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.alias',
                title: 'tracks.{Iterator}.title'
            },
        },
    },


    'shzm-top50-us-nyc': {
        spotify: {
            playlist: 'https://spoti.fi/2Ko2fP4',
        },

        now_playing: {
            description: 'Last 50 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zaGF6YW0vdjMvZW4tVVMvSUwvd2ViLy0vdHJhY2tzL2lwLWNpdHktY2hhcnQtNTEyODU4MT9wYWdlU2l6ZT01MCZzdGFydEZyb209MA==',
        },

        parser: {
            type: 'json',

            options: {
                limit: 50,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.alias',
                title: 'tracks.{Iterator}.title'
            },
        },
    },


    'shzm-rising-us': {
        spotify: {
            playlist: 'https://spoti.fi/3nNvKYT',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zaGF6YW0vdjMvZW4tVVMvSUwvd2ViLy0vdHJhY2tzL3Jpc2Vycy1jb3VudHJ5LWNoYXJ0LVVTP3BhZ2VTaXplPTIwJnN0YXJ0RnJvbT0w',
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.alias',
                title: 'tracks.{Iterator}.title'
            },
        },
    },


    'shzm-top200-us': {
        spotify: {
            playlist: 'https://spoti.fi/3nLcDyy',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zaGF6YW0vdjMvZW4tVVMvSUwvd2ViLy0vdHJhY2tzL2lwLWNvdW50cnktY2hhcnQtVVM/cGFnZVNpemU9MjAwJnN0YXJ0RnJvbT0w',
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.alias',
                title: 'tracks.{Iterator}.title'
            },
        },
    },


    'shzm-rising-israel': {
        spotify: {
            playlist: 'https://spoti.fi/34B0CEm',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zaGF6YW0vdjMvZW4tVVMvSUwvd2ViLy0vdHJhY2tzL3Jpc2Vycy1jb3VudHJ5LWNoYXJ0LUlMP3BhZ2VTaXplPTIwJnN0YXJ0RnJvbT0w',
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.alias',
                title: 'tracks.{Iterator}.title'
            },
        },
    },


    'shzm-top200-israel': {
        spotify: {
            playlist: 'https://spoti.fi/34CIYzY',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zaGF6YW0vdjMvZW4tVVMvSUwvd2ViLy0vdHJhY2tzL2lwLWNvdW50cnktY2hhcnQtSUw/cGFnZVNpemU9MjAwJnN0YXJ0RnJvbT0w',
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.alias',
                title: 'tracks.{Iterator}.title'
            },
        },
    },


    'shzm-top200-global': {
        spotify: {
            playlist: 'https://spoti.fi/3rnBgUs',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zaGF6YW0vdjMvZW4tVVMvSUwvd2ViLy0vdHJhY2tzL2lwLWdsb2JhbC1jaGFydD9wYWdlU2l6ZT0yMDAmc3RhcnRGcm9tPTA=',
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.alias',
                title: 'tracks.{Iterator}.title'
            },
        },
    },
};

const bigtopCharts = {
    'bigtop-40': {
        spotify: {
            playlist: 'https://spoti.fi/34C4ogI',
        },

        now_playing: {
            description: 'Last 40 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmlndG9wNDAuY29tLw==',
        },

        parser: {
            type: 'html',

            fields: {
                artist: '.chart-entry__track-info__track-title',
                title: '.chart-entry__track-info__track-artist'
            },
        },
    },
};

const billboardCharts = {
    'billboard-official-uk': {
        spotify: {
            playlist: 'https://spoti.fi/3pgYmKt'
        },

        now_playing: {
            description: 'Last 20 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (60 * 60 * 1) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmlsbGJvYXJkLmNvbS9jaGFydHMvb2ZmaWNpYWwtdWstc29uZ3M=',
        },

        parser: {
            type: 'html',

            options: {
                limit: 20,
            },

            fields: {
                title: '.chart-list-item__title-text',
                artist: '.chart-list-item__artist',
            },
        },
    },


    'billboard-global100': {
        spotify: {
            playlist: 'https://spoti.fi/3h95Uw3'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (60 * 60 * 1) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmlsbGJvYXJkLmNvbS9jaGFydHMvYmlsbGJvYXJkLWdsb2JhbC0yMDA=',
        },

        parser: {
            type: 'html',

            options: {
                limit: 100,
            },

            fields: {
                title: '.chart-element__information__song',
                artist: '.chart-element__information__artist',
            },
        },
    },


    'billboard-hot100': {
        spotify: {
            playlist: 'https://spoti.fi/3h9hBCO'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (60 * 60 * 1) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmlsbGJvYXJkLmNvbS9jaGFydHMvaG90LTEwMA==',
        },

        parser: {
            type: 'html',

            options: {
                limit: 100,
            },

            fields: {
                title: '.chart-element__information__song',
                artist: '.chart-element__information__artist',
            },
        },
    },
};

const kanCharts = {
    'kan-gimiel-editor': {
        spotify: {
            playlist: 'https://spoti.fi/37H0GnZ'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (60 * 60 * 1) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cua2FuLm9yZy5pbC9wYWdlLmFzcHg/bGFuZGluZ1BhZ2VJZD0xMDQ5',
        },

        parser: {
            type: 'html',

            options: {
                limit: 50,
            },

            fields: {
                title: '.magazine .magazine_info_title',
            },
        },
    },
};

const bpCharts = {
    'bp-top100': {
        spotify: {
            playlist: 'https://spoti.fi/3h2V2Q5'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (60 * 60 * 1) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmVhdHBvcnQuY29tL3RvcC0xMDA=',
            regExp: [new RegExp('Playables = (.*?);')],
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.name',
                title: 'tracks.{Iterator}.title',
                mix: 'tracks.{Iterator}.mix',
                genre: 'tracks.{Iterator}.genres.0.name',
                label: 'tracks.{Iterator}.label.name',
                bpm: 'tracks.{Iterator}.bpm',
                date_published: 'tracks.{Iterator}.date.published',
                component: 'tracks.{Iterator}.component',
                duration_string: 'tracks.{Iterator}.duration.minutes',
                duration_ms: 'tracks.{Iterator}.duration.milliseconds',
            },
        },
    },


    'bp-psy-trance': {
        spotify: {
            playlist: 'https://spoti.fi/38qkGuu'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (60 * 60 * 1) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmVhdHBvcnQuY29tL2dlbnJlL3BzeS10cmFuY2UvMTMvdHJhY2tz',
            regExp: [new RegExp('Playables = (.*?);')],
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'tracks.{Iterator}.artists.0.name',
                title: 'tracks.{Iterator}.title',
                mix: 'tracks.{Iterator}.mix',
                genre: 'tracks.{Iterator}.genres.0.name',
                label: 'tracks.{Iterator}.label.name',
                bpm: 'tracks.{Iterator}.bpm',
                date_published: 'tracks.{Iterator}.date.published',
                component: 'tracks.{Iterator}.component',
                duration_string: 'tracks.{Iterator}.duration.minutes',
                duration_ms: 'tracks.{Iterator}.duration.milliseconds',
            },
        },
    },
};

const z100Charts = {
    'z100-top': {
        spotify: {
            playlist: 'https://spoti.fi/3mM0xnu',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly96MTAwLmloZWFydC5jb20vbXVzaWMvdG9wLXNvbmdzLw==',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        parser: {
            type: 'html',

            fields: {
                artist: '.track-details > a:first-child, .track-artist',
                title: '.livecard-title a:first-child, .track-title'
            },
        },
    },
};

const europaPlusCharts = {
    'euplus-ru-top': {
        spotify: {
            playlist: 'https://spoti.fi/3rMaJA5',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9ldXJvcGFwbHVzLnJ1L3BsYXlsaXN0P2NhdGVnb3J5PXRvcDQw',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        parser: {
            type: 'html',

            options: {
                reverse: true,
            },

            fields: {
                artist: '.song .song__name > div > a:first-child',
                title: '.song .song__name > p'
            },
        },
    },


    'euplus-ru-new': {
        spotify: {
            playlist: 'https://spoti.fi/3o9gtBY',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9ldXJvcGFwbHVzLnJ1L3BsYXlsaXN0P2NhdGVnb3J5PW5vdmVsdGllcw==',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        parser: {
            type: 'html',

            options: {
                reverse: true,
            },

            fields: {
                artist: '.song .song__name > div > a:first-child',
                title: '.song .song__name > p'
            },
        },
    },
};

// stations

const capitalfmStations = {
    'capitalfm-now': {
        spotify: {
            playlist: 'https://spoti.fi/3xaI9Mk',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuY2FwaXRhbGZtLmNvbS9yYWRpby9sYXN0LXBsYXllZC1zb25ncy8=',
        },

        parser: {
            type: 'html',

            fields: {
                artist: '.now-playing__text-content__details__track',
                title: '.now-playing__text-content__details__artist'
            },
        },
    },
};

const xmStations = {
    'xm-hits1': {
        spotify: {
            playlist: 'https://spoti.fi/3zfSpFI'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2lyaXVzeG0uY29tL3NlcnZsZXQvU2F0ZWxsaXRlP2Q9JnBhZ2VuYW1lPVNYTSUyRlNlcnZpY2VzJTJGTW91bnRhaW5XcmFwcGVyJmRlc2t0b3A9JmNoYW5uZWxzPXNpcml1c2hpdHMx',
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'channels.siriushits1.content.artists.0.name',
                title: 'channels.siriushits1.content.title',
                album: 'channels.siriushits1.content.album.title'
            },
        },
    },


    'xm-the-pulse': {
        spotify: {
            playlist: 'https://spoti.fi/3zfTJIM'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2lyaXVzeG0uY29tL3NlcnZsZXQvU2F0ZWxsaXRlP2Q9JnBhZ2VuYW1lPVNYTSUyRlNlcnZpY2VzJTJGTW91bnRhaW5XcmFwcGVyJmRlc2t0b3A9eWVzJmNoYW5uZWxzPWJpZzgwcyx0aGVzcGVjdHJ1bSw4MjA2LHN0YXJsaXRl',
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'channels.starlite.content.artists.0.name',
                title: 'channels.starlite.content.title',
                album: 'channels.starlite.content.album.title'
            },
        },
    },
};

const virginStations = {
    'virgin-recently-played': {
        spotify: {
            playlist: 'https://spoti.fi/3mzvwDd'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly92aXJnaW5yYWRpby5jby51ay9zaXRlcy92aXJnaW5yYWRpby5jby51ay9maWxlcy9ub2NhY2hlL25vd19sYXN0c29uZ3NfanNvbi5qc29uP3t0aW1lfSZjYWxsYmFjaz1qc29uQ2FsbGJhY2tfYW50aGVtcw==',
            regExp: [new RegExp('\\((.*?)\\);')],
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'nowplaying.{Iterator}.artist',
                title: 'nowplaying.{Iterator}.title',
                album: 'nowplaying.{Iterator}.album'
            },
        },
    },
};

const glzStations = {
    'glz-onair': {
        spotify: {
            playlist: 'https://spoti.fi/34otpMr'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9nbHp4bWwuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RhbGV0L2dsZ2x6LW9uYWlyL29uYWlyLnhtbA==',
        },

        parser: {
            type: 'xml',

            fields: {
                artist: 'BroadcastMonitor.Current.artistName',
                title: 'BroadcastMonitor.Current.titleName',
                album: 'BroadcastMonitor.Current.albumName',
                author: 'BroadcastMonitor.Current.Author',
                year: 'BroadcastMonitor.Current.Year',
                label: 'BroadcastMonitor.Current.Label',
                duration_seconds: 'BroadcastMonitor.Current.itemDuration',
                category: 'BroadcastMonitor.Current.CategoryName',
                categoryID: 'BroadcastMonitor.Current.CategoryId',
            },
        },
    },
};

const fm100Stations = {
    '100fm-ch91-hot': {
        spotify: {
            playlist: 'https://spoti.fi/3pk2cm1'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2RpZ2l0YWwuMTAwZm0uY28uaWwvbGFiZWwvQ2g5MS1Ib3QueG1s',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist'
            },
        },
    },


    '100fm-onair': {
        spotify: {
            playlist: 'https://spoti.fi/3nDLuxx'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000
        },

        scraper: {
            type: 'get',
            url: 'dHRwczovL2VwZy1vdXQtczMtYnVja2V0LTQyLnMzLWV1LXdlc3QtMS5hbWF6b25hd3MuY29tLzEwMGZtX2VwZy54bWw=',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist'
            },
        },
    },
};

const us997Stations = {
    '99-mow': {
        spotify: {
            playlist: 'https://spoti.fi/2PPx3ul'
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL3BsYXllci5saXN0ZW5saXZlLmNvLzU1NDQxL2VuL3NvbmdoaXN0b3J5',
            regExp: [new RegExp('songs = (.*?);')],
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
                reverse: true,
            },

            fields: {
                artist: '{Iterator}.artist',
                title: '{Iterator}.title'
            },
        },
    },
};

const eco99Stations = {
    'eco99fm-live-radio': {
        spotify: {
            playlist: 'https://spoti.fi/3mKh3a1',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9maXJlc3RvcmUuZ29vZ2xlYXBpcy5jb20vdjEvcHJvamVjdHMvZWNvLTk5LXByb2R1Y3Rpb24vZGF0YWJhc2VzLyhkZWZhdWx0KS9kb2N1bWVudHMvc3RyZWFtZWRfY29udGVudA==',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'documents.0.fields.artist_name.stringValue',
                title: 'documents.0.fields.song_name.stringValue'
            },
        },
    },
};

const z100Stations = {
    'z100-recent': {
        spotify: {
            playlist: 'https://spoti.fi/34Eyq3I',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93dy5hcGkuaWhlYXJ0LmNvbS9hcGkvdjMvbGl2ZS1tZXRhL3N0cmVhbS8xNDY5L2N1cnJlbnRUcmFja01ldGE/ZGVmYXVsdE1ldGFkYXRhPXRydWU=',
        },

        now_playing: {

            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'artist',
                title: 'title'
            },
        },
    },
};


const europaPlusStations = {
    'euplus-ru-live': {
        spotify: {
            playlist: 'https://spoti.fi/2MssWCM',
        },

        scraper: {
            type: 'websocket',
            url: 'd3NzOi8vbWV0YWRhdGF3cy5ob3N0aW5ncmFkaW8ucnUv',
            payload: {"fetch":{"current":["ep"]}}
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'ep.current.title',
                title: 'ep.current.artist'
            },
        },
    },
};

const dorognoeStations = {
    'dorognoe-ru-live': {
        spotify: {
            playlist: 'https://spoti.fi/3516HtY',
        },

        scraper: {
            type: 'headless',
            url: 'aHR0cHM6Ly9kb3JvZ25vZS5ydS8=',
        },

        now_playing: {
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: (35) * 1000,
        },

        parser: {
            type: 'html',

            fields: {
                artist: '.mp-reading .mp-reading__artist',
                title: '.mp-reading .mp-reading__song'
            },
        },
    },
};


const charts = {
    ...shzmCharts,
    ...bigtopCharts,
    ...billboardCharts,
    ...kanCharts,
    ...bpCharts,
    ...z100Charts,
    ...europaPlusCharts,
};

const stations = {
    ...capitalfmStations,
    ...xmStations,
    ...virginStations,
    ...glzStations,
    ...fm100Stations,
    ...us997Stations,
    ...eco99Stations,
    ...z100Stations,
    ...europaPlusStations,
    ...dorognoeStations,
};

export {
    charts,
    stations
};
