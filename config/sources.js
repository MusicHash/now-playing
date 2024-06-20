// Charts
const shzmCharts = {
    'shzm-discovery-uk': {
        spotify: {
            playlist: 'https://spoti.fi/2WGAow0',
        },

        now_playing: {
            title: 'SHZM - Discovery - UK (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zZXJ2aWNlcy9jaGFydHMvY3N2L2Rpc2NvdmVyeS91bml0ZWQta2luZ2RvbQ==',
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
            },

            fields: {
                artist: '{Iterator}.Artist',
                title: '{Iterator}.Title',
            },
        },
    },

    'shzm-top200-uk': {
        spotify: {
            playlist: 'https://spoti.fi/2KQmXXo',
        },

        now_playing: {
            title: 'SHZM - Top Hits 200 - UK (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zZXJ2aWNlcy9jaGFydHMvY3N2L3RvcC0yMDAvdW5pdGVkLWtpbmdkb20=',
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
            },

            fields: {
                artist: '{Iterator}.Artist',
                title: '{Iterator}.Title',
            },
        },
    },

    'shzm-top50-us-nyc': {
        spotify: {
            playlist: 'https://spoti.fi/2Ko2fP4',
        },

        now_playing: {
            title: 'SHZM - Top 50 Hits - NYC (#Music)',
            description: 'Last 50 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zZXJ2aWNlcy9jaGFydHMvY3N2L3RvcC01MC91bml0ZWQtc3RhdGVzL25ldy15b3JrLWNpdHk=',
        },

        parser: {
            type: 'csv',

            options: {
                limit: 50,
            },

            fields: {
                artist: '{Iterator}.Artist',
                title: '{Iterator}.Title',
            },
        },
    },

    'shzm-discovery-us': {
        spotify: {
            playlist: 'https://spoti.fi/3nNvKYT',
        },

        now_playing: {
            title: 'SHZM - Discovery - USA (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zZXJ2aWNlcy9jaGFydHMvY3N2L2Rpc2NvdmVyeS91bml0ZWQtc3RhdGVz',
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
            },

            fields: {
                artist: '{Iterator}.Artist',
                title: '{Iterator}.Title',
            },
        },
    },

    'shzm-top200-us': {
        spotify: {
            playlist: 'https://spoti.fi/3nLcDyy',
        },

        now_playing: {
            title: 'SHZM - Top Hits 200 - USA (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zZXJ2aWNlcy9jaGFydHMvY3N2L3RvcC0yMDAvdW5pdGVkLXN0YXRlcw==',
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
            },

            fields: {
                artist: '{Iterator}.Artist',
                title: '{Iterator}.Title',
            },
        },
    },

    'shzm-discovery-israel': {
        spotify: {
            playlist: 'https://spoti.fi/34B0CEm',
        },

        now_playing: {
            title: 'SHZM - Discovery - Israel (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zZXJ2aWNlcy9jaGFydHMvY3N2L2Rpc2NvdmVyeS9pc3JhZWw=',
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
            },

            fields: {
                artist: '{Iterator}.Artist',
                title: '{Iterator}.Title',
            },
        },
    },

    'shzm-top200-israel': {
        spotify: {
            playlist: 'https://spoti.fi/34CIYzY',
        },

        now_playing: {
            title: 'SHZM - Top Hits 200 - Israel (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zZXJ2aWNlcy9jaGFydHMvY3N2L3RvcC0yMDAvaXNyYWVs',
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
            },

            fields: {
                artist: '{Iterator}.Artist',
                title: '{Iterator}.Title',
            },
        },
    },

    'shzm-top200-global': {
        spotify: {
            playlist: 'https://spoti.fi/3rnBgUs',
        },

        now_playing: {
            title: 'SHZM - Top Hits 200 - Global (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuc2hhemFtLmNvbS9zZXJ2aWNlcy9jaGFydHMvY3N2L3RvcC0yMDAvd29ybGQ=',
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
            },

            fields: {
                artist: '{Iterator}.Artist',
                title: '{Iterator}.Title',
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
            title: 'BigTop- 40 Top Tracks (#Music)',
            description: 'Last 40 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmlndG9wNDAuY29tLw==',
        },

        parser: {
            type: 'html',

            fields: {
                artist: '.chart-entry__track-info__track-title',
                title: '.chart-entry__track-info__track-artist',
            },
        },
    },
};

const billboardCharts = {
    'billboard-official-uk': {
        spotify: {
            playlist: 'https://spoti.fi/3pgYmKt',
        },

        now_playing: {
            title: 'Billboard - Official UK (#Music)',
            description: 'Last 20 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 60 * 60 * 1 * 1000,
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
                title: 'li ul li h3.c-title',
                artist: 'li ul li span.a-no-trucate',
            },
        },
    },

    'billboard-global100': {
        spotify: {
            playlist: 'https://spoti.fi/3h95Uw3',
        },

        now_playing: {
            title: 'Billboard - GLOBAL 100 (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 60 * 60 * 1 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmlsbGJvYXJkLmNvbS9jaGFydHMvYmlsbGJvYXJkLTIwMC8=',
        },

        parser: {
            type: 'html',

            options: {
                limit: 100,
            },

            fields: {
                title: 'li ul li h3.c-title',
                artist: 'li ul li span.a-no-trucate',
            },
        },
    },

    'billboard-hot100': {
        spotify: {
            playlist: 'https://spoti.fi/3h9hBCO',
        },

        now_playing: {
            title: 'Billboard - HOT 100 (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 60 * 60 * 1 * 1000,
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
                title: 'li ul li h3.c-title',
                artist: 'li ul li span.a-no-trucate',
            },
        },
    },
};

const kanCharts = {
    'kan-gimiel-editor': {
        spotify: {
            playlist: 'https://spoti.fi/3PgyZG9',
        },

        now_playing: {
            title: 'Kan - Gimel - Editor Selection (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 60 * 60 * 1 * 1000,
        },

        scraper: {
            type: 'headless',
            url: 'aHR0cHM6Ly93d3cua2FuLm9yZy5pbC9wYWdlLmFzcHg/bGFuZGluZ1BhZ2VJZD0xMDQ5',
        },

        parser: {
            type: 'html',

            options: {
                limit: 26,
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
            playlist: 'https://spoti.fi/3h2V2Q5',
        },

        now_playing: {
            title: 'BP Top - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 60 * 60 * 1 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmVhdHBvcnQuY29tL3RvcC0xMDA=',
            regExp: [new RegExp('<script id="__NEXT_DATA__" type="application/json">(.*?)</script>')],
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.artists.0.name',
                title: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.name',
                label: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.release.label.name',
                mix: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.mix_name',
                bpm: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.bpm',
                price: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.price.value',
                duration_string: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.length',
                duration_ms: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.length_ms',
                genre: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.genre.name',
                date_published: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.new_release_date'
            },
        },
    },

    'bp-psy-trance': {
        spotify: {
            playlist: 'https://spoti.fi/38qkGuu',
        },

        now_playing: {
            title: 'BP Psy Trance - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 60 * 60 * 1 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmVhdHBvcnQuY29tL2dlbnJlL3BzeS10cmFuY2UvMTMvdHJhY2tz',
            regExp: [new RegExp('<script id="__NEXT_DATA__" type="application/json">(.*?)</script>')],
        },

        parser: {
            type: 'json',

            options: {
                limit: 100,
            },

            fields: {
                artist: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.artists.0.name',
                title: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.name',
                label: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.release.label.name',
                mix: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.mix_name',
                bpm: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.bpm',
                price: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.price.value',
                duration_string: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.length',
                duration_ms: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.length_ms',
                genre: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.genre.name',
                date_published: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.new_release_date'
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
            title: 'Z100 - Top Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'html',

            fields: {
                artist: '.track-details > a:first-child, .track-artist',
                title: '.livecard-title a:first-child, .track-title',
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
            title: 'EuropaPlus (RU) - Top 40 Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'html',

            options: {
                reverse: true,
            },

            fields: {
                artist: '.song .song__name > div > a:first-child',
                title: '.song .song__name > p',
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
            title: 'EuropaPlus (RU) - New Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'html',

            options: {
                reverse: true,
            },

            fields: {
                artist: '.song .song__name > div > a:first-child',
                title: '.song .song__name > p',
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
            title: 'CapitalFM - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuY2FwaXRhbGZtLmNvbS9yYWRpby9sYXN0LXBsYXllZC1zb25ncy8=',
        },

        parser: {
            type: 'html',

            fields: {
                artist: '.now-playing__text-content__details__artist',
                title: '.now-playing__text-content__details__track',
            },
        },
    },
};

const xmStations = {
    'xm-hits1': {
        spotify: {
            playlist: 'https://spoti.fi/3zfSpFI',
        },

        now_playing: {
            title: 'XM1 Hits - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
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
                album: 'channels.siriushits1.content.album.title',
            },
        },
    },

    'xm-the-pulse': {
        spotify: {
            playlist: 'https://spoti.fi/3zfTJIM',
        },

        now_playing: {
            title: 'XM1 Pulse - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
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
                album: 'channels.starlite.content.album.title',
            },
        },
    },
};

const virginStations = {
    'virgin-recently-played': {
        spotify: {
            playlist: 'https://spoti.fi/3mzvwDd',
        },

        now_playing: {
            title: 'VG - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly92aXJnaW5yYWRpby5jby51ay9hcGkvZ2V0LXN0YXRpb24tZGF0YT9zdGF0aW9uPXZpcmdpbnJhZGlvdWsmd2l0aFNvbmdzPTEmaGFzUHJvZ3JhbXM9MSZudW1iZXJPZlNvbmdzPTIw',
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recentlyPlayed.{Iterator}.artist',
                title: 'recentlyPlayed.{Iterator}.title',
            },
        },
    },
};

const glzStations = {
    'glz-onair': {
        spotify: {
            playlist: 'https://spoti.fi/34otpMr',
        },

        now_playing: {
            title: 'GLZ - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
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

const fm88Stations = {
    '88fm-live': {
        spotify: {
            playlist: 'https://spoti.fi/3Hi5xfJ',
        },

        now_playing: {
            title: '88FM - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9lcGctb3V0LXMzLWJ1Y2tldC00Mi5zMy1ldS13ZXN0LTEuYW1hem9uYXdzLmNvbS84OGZtX2VwZy54bWw=',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist',
            },
        },
    },
};

const fm91Stations = {
    '91fm-live': {
        spotify: {
            playlist: 'https://spoti.fi/3xwUKdc',
        },

        now_playing: {
            title: '91FM - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9lcGctb3V0LXMzLWJ1Y2tldC00Mi5zMy1ldS13ZXN0LTEuYW1hem9uYXdzLmNvbS85MWZtX2VwZy54bWw=',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist',
            },
        },
    },
};

const fm100Stations = {
    '100fm-ch91-hot': {
        spotify: {
            playlist: 'https://spoti.fi/3pk2cm1',
        },

        now_playing: {
            title: '100FM - Yam Tihoni Hits (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2RpZ2l0YWwuMTAwZm0uY28uaWwvbGFiZWwvQ2g5MS1Ib3QueG1s',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist',
            },
        },
    },

    '100fm-onair': {
        spotify: {
            playlist: 'https://spoti.fi/3nDLuxx',
        },

        now_playing: {
            title: '100FM - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9lcGctb3V0LXMzLWJ1Y2tldC00Mi5zMy1ldS13ZXN0LTEuYW1hem9uYXdzLmNvbS8xMDBmbV9lcGcueG1s',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist',
            },
        },
    },
};

const fm102Stations = {
    '102fm-live': {
        spotify: {
            playlist: 'https://spoti.fi/3O8W3FG',
        },

        now_playing: {
            title: '102FM - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9lcGctb3V0LXMzLWJ1Y2tldC00Mi5zMy1ldS13ZXN0LTEuYW1hem9uYXdzLmNvbS8xMDJmbV9lcGcueG1s',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist',
            },
        },
    },
};

const fm103Stations = {
    '103fm-live': {
        spotify: {
            playlist: 'https://spoti.fi/3zwgcl3',
        },

        now_playing: {
            title: '103FM - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9lcGctb3V0LXMzLWJ1Y2tldC00Mi5zMy1ldS13ZXN0LTEuYW1hem9uYXdzLmNvbS8xMDNmbV9lcGcueG1s',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist',
            },
        },
    },
};

const fm1075Stations = {
    '107.5fm-live': {
        spotify: {
            playlist: 'https://spoti.fi/3Qv4oFQ',
        },

        now_playing: {
            title: '107.5FM - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9lcGctb3V0LXMzLWJ1Y2tldC00Mi5zMy1ldS13ZXN0LTEuYW1hem9uYXdzLmNvbS8xMDc1Zm1fZXBnLnhtbA==',
        },

        parser: {
            type: 'xml',

            fields: {
                title: 'track.name',
                artist: 'track.artist',
            },
        },
    },
};

const us997Stations = {
    '99-mow': {
        spotify: {
            playlist: 'https://spoti.fi/2PPx3ul',
        },

        now_playing: {
            title: '9FM MOW - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9jYWNoZS5ib25uZXZpbGxlLmNsb3VkL3YxL21ldGEvaG90bGluZS9vcmcvQklDL21hcmtldC9TYW5GcmFuY2lzY28vc3RhdGlvbi9LTVZRLUZN',
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'desc',
                title: 'title',
            },
        },
    },
};

const eco99Stations = {
    'eco99fm-live-radio': {
        spotify: {
            playlist: 'https://spoti.fi/3NM3XFc',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9maXJlc3RvcmUuZ29vZ2xlYXBpcy5jb20vdjEvcHJvamVjdHMvZWNvLTk5LXByb2R1Y3Rpb24vZGF0YWJhc2VzLyhkZWZhdWx0KS9kb2N1bWVudHMvc3RyZWFtZWRfY29udGVudA==',
        },

        now_playing: {
            title: 'ECO - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'documents.0.fields.artist_name.stringValue',
                title: 'documents.0.fields.song_name.stringValue',
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
            url: 'aHR0cHM6Ly96MTAwLmloZWFydC5jb20vbXVzaWMvcmVjZW50bHktcGxheWVkLw==',
        },

        now_playing: {
            title: 'Z10 - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'html',

            options: {
                limit: 1,
            },

            fields: {
                artist: '.track-details > a:first-child, .track-artist',
                title: '.livecard-title a:first-child, .track-title',
            },
        },
    },
};

const europaPlusStations = {
    'euplus-ru-live': {
        spotify: {
            playlist: 'https://spoti.fi/3zuFDms',
        },

        scraper: {
            type: 'websocket',
            url: 'd3NzOi8vbWV0YWRhdGF3cy5ob3N0aW5ncmFkaW8ucnUv',
            payload: { fetch: { current: ['ep'] } },
        },

        now_playing: {
            title: 'Europa (RU) - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'ep.current.title',
                title: 'ep.current.artist',
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
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'html',

            fields: {
                artist: '.mp-reading .mp-reading__artist',
                title: '.mp-reading .mp-reading__song',
            },
        },
    },
};

const charts = {
    // IL
    ...kanCharts,
    ...shzmCharts,

    // World
    ...bigtopCharts,
    ...billboardCharts,
    ...bpCharts,
    ...z100Charts,
    ...europaPlusCharts,
};

const stations = {
    // IL
    ...glzStations,
    //...fm88Stations,
    //...fm91Stations,
    ...eco99Stations,
    //...fm100Stations,
    //...fm102Stations,
    //...fm103Stations,

    // World
    ...capitalfmStations,
    ...xmStations,
    ...virginStations,
    ...us997Stations,
    ...z100Stations,
    ...europaPlusStations,
    //...dorognoeStations,
};

export { charts, stations };
