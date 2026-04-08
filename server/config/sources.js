// Charts
const shzmCharts = {
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
            regExp: [new RegExp('days]"\n(.*)', 's')],
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
                delimiter: {
                    field: ',',
                },
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
            regExp: [new RegExp('days]"\n(.*)', 's')],
        },

        parser: {
            type: 'csv',

            options: {
                limit: 50,
                delimiter: {
                    field: ',',
                },
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
            regExp: [new RegExp('days]"\n(.*)', 's')],
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
                delimiter: {
                    field: ',',
                },
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
            regExp: [new RegExp('days]"\n(.*)', 's')],
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
                delimiter: {
                    field: ',',
                },
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
            regExp: [new RegExp('days]"\n(.*)', 's')],
        },

        parser: {
            type: 'csv',

            options: {
                limit: 100,
                delimiter: {
                    field: ',',
                },
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
            title: 'BigTop - 40 Top Tracks (#Music)',
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


const bpCharts = {
    'bp-top100': {
        spotify: {
            playlist: 'https://spoti.fi/3h2V2Q5',
        },

        now_playing: {
            title: 'BP Top - Latest Tracks (#Music)',
            description: 'Last 100 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 60 * 60 * 1 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmVhdHBvcnQuY29tL3RvcC0xMDA=',
            regExp: [new RegExp('<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>', 's')],
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
                date_published: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.new_release_date',
            },
        },
    },

    'bp-psy-trance': {
        spotify: {
            playlist: 'https://spoti.fi/38qkGuu',
        },

        now_playing: {
            title: 'BP Psy Trance (Full On) - Latest Tracks (#Music)',
            description: 'Last 100 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 60 * 60 * 1 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93d3cuYmVhdHBvcnQuY29tL2dlbnJlL3BzeS10cmFuY2UvMTMvdG9wLTEwMA==',
            regExp: [new RegExp('<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>', 's')],
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
                date_published: 'props.pageProps.dehydratedState.queries.0.state.data.results.{Iterator}.new_release_date',
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
            title: 'Z100 - NYC - Latest Tracks (#Music)',
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
            url: 'aHR0cHM6Ly9ldXJvcGFwbHVzLnJ1L3Byb2dyYW1zL3RvcDQw',
        },

        now_playing: {
            title: 'EuropaPlus (RU) - Moscow - Top 40 Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'html',

            options: {
                reverse: true,
            },

            fields: {
                artist: '.track-and-artists .artist',
                title: '.track-and-artists .track-name',
            },
        },
    },

    'euplus-ru-new': {
        spotify: {
            playlist: 'https://spoti.fi/3o9gtBY',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9ldXJvcGFwbHVzLnJ1L25vdmVsdGllcw==',
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
                artist: '.track-and-artists .artist',
                title: '.track-and-artists .track-name',
            },
        },
    },
};


const makoCharts = {
    'mako-international': {
        spotify: {
            playlist: 'https://spoti.fi/',
        },

        now_playing: {
            title: 'Mako - International Top 20 Tracks (#Music)',
            description: 'Top 20 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9oaXRsaXN0Lm1ha28uY28uaWwvaW50ZXJuYXRpb25hbA==',
        },

        parser: {
            type: 'html',

            fields: {
                artist: '[class*="artist-and-title-"] h3',
                title: '[class*="artist-and-title-"] h4',
            },
        },
    },


    'mako-israeli': {
        spotify: {
            playlist: 'https://spoti.fi/',
        },

        now_playing: {
            title: 'Mako - Israel Top 100 Tracks (#Music)',
            description: 'Top 100 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9oaXRsaXN0Lm1ha28uY28uaWwvaXNyYWVs',
        },

        parser: {
            type: 'html',

            fields: {
                artist: '[class*="artist-and-title-"] h3',
                title: '[class*="artist-and-title-"] h4',
            },
        },
    },


    'mako-new-songs': {
        spotify: {
            playlist: 'https://spoti.fi/',
        },

        now_playing: {
            title: 'Mako - New Songs Top 100 Tracks (#Music)',
            description: 'Top 100 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9oaXRsaXN0Lm1ha28uY28uaWwvbmV3LXNvbmdz',
        },

        parser: {
            type: 'html',

            fields: {
                artist: '[class*="artist-and-title-"] h3',
                title: '[class*="artist-and-title-"] h4',
            },
        },
    },


    'mako-top100': {
        spotify: {
            playlist: 'https://spoti.fi/',
        },

        now_playing: {
            title: 'Mako - Top 100 Tracks (#Music)',
            description: 'Top 100 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9oaXRsaXN0Lm1ha28uY28uaWwv',
        },

        parser: {
            type: 'html',

            fields: {
                artist: '[class*="artist-and-title-"] h3',
                title: '[class*="artist-and-title-"] h4',
            },
        },
    },
};

// stations
const capitalfmStations = {
    '95.8fm_capitalfm_london': {
        spotify: {
            playlist: 'https://spoti.fi/3xaI9Mk',
        },

        now_playing: {
            title: '95.8FM - CapitalFM - London - Latest Tracks (#Music)',
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
            url: 'aHR0cHM6Ly9sb29rYXJvdW5kLWNhY2hlLXByb2Quc3RyZWFtaW5nLnNpcml1c3htLmNvbS9jb250ZW50c2VydmljZXMvdjEvbGl2ZS9sb29rQXJvdW5k',
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'channels.194adbca-34d6-cb94-b153-3488ee563308.cuts.0.artistName',
                title: 'channels.194adbca-34d6-cb94-b153-3488ee563308.cuts.0.name',
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
            url: 'aHR0cHM6Ly9sb29rYXJvdW5kLWNhY2hlLXByb2Quc3RyZWFtaW5nLnNpcml1c3htLmNvbS9jb250ZW50c2VydmljZXMvdjEvbGl2ZS9sb29rQXJvdW5k',
        },

        parser: {
            type: 'json',

            fields: {
                artist: 'channels.9e8d6f72-0b59-85cf-a222-b18d38acdc0f.cuts.0.artistName',
                title: 'channels.9e8d6f72-0b59-85cf-a222-b18d38acdc0f.cuts.0.name',
            },
        },
    },
};

const virginStations = {
    'virgin': {
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
            url: 'aHR0cDovL2xvY2FsaG9zdDo1MDAxNS8/dXJsPWh0dHBzOi8vdmlyZ2lucmFkaW8uY28udWsvYXBpL2dldC1zdGF0aW9uLWRhdGE/c3RhdGlvbj12aXJnaW5yYWRpb3VrJndpdGhTb25ncz0xJmhhc1Byb2dyYW1zPTEmbnVtYmVyT2ZTb25ncz0yMA==',
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
    '98.1fm_galgalatz': {
        spotify: {
            playlist: 'https://spoti.fi/',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzk4LjFmbV9nYWxnYWxhdHo=',
        },

        now_playing: {
            title: 'Galgalatz - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },


    '96.6fm_glz': {
        spotify: {
            playlist: 'https://spoti.fi/34otpMr',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzk2LjZmbV9nbHo=',
        },

        now_playing: {
            title: 'GLZ - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },

    /*
    'glz-xml-source': {
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
    */
};

const kanStations = {
    '88fm': {
        spotify: {
            playlist: 'https://spoti.fi/3Hi5xfJ',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzg4Zm0ta2Fu',
        },

        now_playing: {
            title: '88FM - Kan - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },

    '97.5fm_gimel': {
        spotify: {
            playlist: 'https://spoti.fi/3PgyZG9',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzk3LjVmbV9naW1lbC1rYW4=',
        },

        now_playing: {
            title: '97.5FM - Gimel Kan - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },
};

const fm91Stations = {
    '91fm_lev-hamedina': {
        spotify: {
            playlist: 'https://spoti.fi/3xwUKdc',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzkxZm0tbGV2LWhhbWVkaW5h',
        },

        now_playing: {
            title: '91FM - Lev Hamedina - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },
};


const fm100Stations = {
    '100fm_radius': {
        spotify: {
            playlist: 'https://spoti.fi/3nDLuxx',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzEwMGZtLXJhZGl1cw==',
        },

        now_playing: {
            title: '100FM - Radius - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },


    '100fm_hits': {
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
};


const fm101Stations = {
    '101fm_jerusalem': {
        spotify: {
            playlist: 'https://spoti.fi/',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzEwMWZtLWplcnVzYWxlbQ==',
        },

        now_playing: {
            title: '101FM - Radio Jerusalem - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },
};

const fm102Stations = {
    '102fm_tel-aviv': {
        spotify: {
            playlist: 'https://spoti.fi/3O8W3FG',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzEwMmZtLXRsdg==',
        },

        now_playing: {
            title: '102FM - Radio Tel-Aviv - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },
};

const fm103Stations = {
    '103fm_radio_lelo_hafsaka': {
        spotify: {
            playlist: 'https://spoti.fi/3zwgcl3',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzEwM2Zt',
        },

        now_playing: {
            title: '103FM - Radio Lelo Hafsaka - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },
};



const fm1075Stations = {
    '107.5fm_haifa': {
        spotify: {
            playlist: 'https://spoti.fi/3Qv4oFQ',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzEwNy41Zm0taGFpZmE=',
        },

        now_playing: {
            title: '107.5FM - Radio Haifa - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },
};


const makoStations = {
    '24music': {
        spotify: {
            playlist: 'https://spoti.fi/',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cDovL2xvY2FsaG9zdDozODQ3L3N0YXRpb25zLzI0bXVzaWMtdHY=',
        },

        now_playing: {
            title: '24 Music - TV - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'recognition.artist',
                title: 'recognition.title',
                provider: 'recognition.provider',
            },
        },
    },
};

const us997Stations = {
    '997fm_mow': {
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

const fm99Stations = {
    '99fm_eco': {
        spotify: {
            playlist: 'https://spoti.fi/3NM3XFc',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9maXJlc3RvcmUuZ29vZ2xlYXBpcy5jb20vdjEvcHJvamVjdHMvZWNvLTk5LXByb2R1Y3Rpb24vZGF0YWJhc2VzLyhkZWZhdWx0KS9kb2N1bWVudHMvc3RyZWFtZWRfY29udGVudA==',
        },

        now_playing: {
            title: 'ECO 99FM - Latest Tracks (#Music)',
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
    '100.3fm_z100_nyc': {
        spotify: {
            playlist: 'https://spoti.fi/34Eyq3I',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly93ZWJhcGkucmFkaW9lZGl0LmloZWFydC5jb20vZ3JhcGhxbD9vcGVyYXRpb25OYW1lPUdldEN1cnJlbnRseVBsYXlpbmdTb25ncyZ2YXJpYWJsZXM9JTdCJTIyc2x1ZyUyMiUzQSUyMndodHotZm0lMjIlMkMlMjJwYWdpbmclMjIlM0ElN0IlMjJ0YWtlJTIyJTNBMjAlN0QlN0QmZXh0ZW5zaW9ucz0lN0IlMjJwZXJzaXN0ZWRRdWVyeSUyMiUzQSU3QiUyMnZlcnNpb24lMjIlM0ExJTJDJTIyc2hhMjU2SGFzaCUyMiUzQSUyMjM4Njc2M2MxNzE0NTA1NjcxMzMyN2NkZGVjODkwY2Q5ZDRmZWE3NTU4ZWZjNTZkMDliN2NkNDE2N2VlZjYwNjAlMjIlN0QlN0Q=',
        },

        now_playing: {
            title: 'Z10 - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },

            fields: {
                artist: 'data.sites.find.stream.amp.currentlyPlaying.tracks.{Iterator}.artist.artistName',
                title: 'data.sites.find.stream.amp.currentlyPlaying.tracks.{Iterator}.title',
                trackId: 'data.sites.find.stream.amp.currentlyPlaying.tracks.{Iterator}.trackId',
            },
        },
    },
};

const europaPlusStations = {
    '106.2fm_europaplus_moscow': {
        spotify: {
            playlist: 'https://spoti.fi/3zuFDms',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9tZXRhLmhvc3RpbmdyYWRpby5ydS9lbWcvZXVyb3BhcGx1cy9oaXN0b3J5P2RhdGU9e1lFQVJ9LXtNT05USH0te0RBWX0mZnJvbT17SE9VUi1QUkVWSU9VU306e01JTlVURX0mdG89e0hPVVJ9OntNSU5VVEV9JmZvcm1hdD1uYXRpdmUmdHlwZXM9MyZvcmRlcj1kZXNj',
            timezone: 'Europe/Moscow',
        },

        now_playing: {
            title: '106.2FM - EuropaPlus (RU) - Moscow - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },
            
            fields: {
                artist: '{Iterator}.artist',
                title: '{Iterator}.title',
                album: '{Iterator}.album',
                genres: '{Iterator}.genres',
                release_date: '{Iterator}.releaseDate',
            },
        },
    },
};

const dorognoeStations = {
    '96.0fm_dorognoe_moscow': {
        spotify: {
            playlist: 'https://spoti.fi/3516HtY',
        },

        scraper: {
            type: 'get',
            url: 'aHR0cHM6Ly9tZXRhLmhvc3RpbmdyYWRpby5ydS9lbWcvZG9yb2dub2UvaGlzdG9yeT9kYXRlPXtZRUFSfS17TU9OVEh9LXtEQVl9JmZyb209e0hPVVItUFJFVklPVVN9OntNSU5VVEV9JnRvPXtIT1VSfTp7TUlOVVRFfSZmb3JtYXQ9bmF0aXZlJnR5cGVzPTMmb3JkZXI9ZGVzYw==',
            timezone: 'Europe/Moscow',
        },

        now_playing: {
            title: '96.0FM - Dorognoe (RU) - Latest Tracks (#Music)',
            description: 'Last 200 Tracks. LAST UPDATE: {now}',
            refresh_rate_ms: 35 * 1000,
        },

        parser: {
            type: 'json',

            options: {
                limit: 1,
            },
            
            fields: {
                artist: '{Iterator}.artist',
                title: '{Iterator}.title',
                album: '{Iterator}.album',
                genres: '{Iterator}.genres',
                release_date: '{Iterator}.releaseDate',
            },
        },
    },
};


const charts = {
    // IL
    ...shzmCharts,
    ...makoCharts,

    // World
    ...bigtopCharts,
    ...billboardCharts,
    ...bpCharts,
    ...z100Charts,
};

// empty for now, not needed to monitor history based aggregation of stations, everything should be live
// it's used as sort of a fallback in original source is limited
const historyCharts = {
    ...{},
};

const stations = {
    // IL
    ...glzStations,
    ...kanStations,
    ...fm91Stations,
    ...fm99Stations,
    ...fm100Stations,
    ...fm101Stations,
    ...fm102Stations,
    ...fm103Stations,
    ...makoStations,

    // World
    ...capitalfmStations,
    ...xmStations,
    ...virginStations,
    ...us997Stations,
    ...z100Stations,
    ...europaPlusStations,
    ...dorognoeStations,
};

export { charts, historyCharts, stations };
