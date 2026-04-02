import { Router } from 'express';
import prettier from 'prettier';

import { getChartInfo } from '../lib/fetch_sources.js';
import { addSpotifyHyperLinks } from '../utils/spotify_link_generator.js';
import { DEFAULT_STATS_DAYS } from '../lib/query_log/stats_queries.js';
import { stations, charts } from '../../config/sources.js';

export default function debugRoutes(logger) {
    const router = Router();

    router.get('/actions', async (req, res) => {
        let links = {
            '/api/spotify/login': 'Re-Login',
            '/api/crawl_playlists_manually': 'Crawl Stations (all)',
            '/api/update_playlists_manually': 'Update Stations Manually (all)',
            '/api/playlist/refresh_charts/all': 'Refresh Charts - in batches (all)',
            '/api/playlist/slice/all': 'Shorten the playlist to limit (all)',
            '/api/debug_channels': 'Debug Channels',
        };

        let html = Object.keys(links)
            .map(function (result, item) {
                return `<li><a href="${result}">${links[result]}</a></li>`;
            }, 0)
            .join('\r\n');

        let channelsList = Object.assign({}, stations, charts);
        const exampleStation = Object.keys(channelsList)[0] || '';

        const d = DEFAULT_STATS_DAYS;

        html += "<li style='margin-top:30px'><strong>Play stats API (JSON)</strong></li>";
        html += `<li style='list-style:none;font-size:12px;color:#555;margin:4px 0 8px'>Window: <code>days</code> (default <code>${d}</code>). Also: <code>limit</code>, <code>station</code>, <code>stationLike</code>. Links below include <code>days=${d}</code> where applicable.</li>`;

        const dataStatLinks = [
            ['/api/data/stations', 'stations · configured (sources.js) + logged (distinct DB)'],
            [`/api/data/stats/plays-by-day?days=${d}`, `plays-by-day · days=${d}`],
            ['/api/data/stats/plays-by-day?days=30', 'plays-by-day · days=30'],
            [`/api/data/stats/top-tracks?days=${d}`, `top-tracks · days=${d}`],
            ['/api/data/stats/top-tracks?days=30&limit=25', 'top-tracks · days=30, limit 25'],
            [`/api/data/stats/top-tracks-momentum?days=${d}`, `top-tracks-momentum · days=${d}`],
            ['/api/data/stats/top-tracks-momentum?days=30&limit=10', 'top-tracks-momentum · days=30, limit 10'],
            [`/api/data/stats/top-artists?days=${d}`, `top-artists · days=${d}`],
            [`/api/data/stats/top-stations?days=${d}`, `top-stations · days=${d}`],
            [`/api/data/stats/recent-plays?days=${d}`, `recent-plays · days=${d}`],
            ['/api/data/stats/recent-plays?days=30&limit=30', 'recent-plays · days=30, limit 30'],
            [`/api/data/stats/top-tracks?days=${d}&stationLike=glz&limit=20`, `top-tracks · days=${d}, stationLike=glz`],
        ];
        if (exampleStation) {
            const enc = encodeURIComponent(exampleStation);
            dataStatLinks.push(
                [`/api/data/stats/plays-by-day?days=${d}&station=${enc}`, `plays-by-day · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/top-tracks?days=${d}&station=${enc}&limit=20`, `top-tracks · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/top-tracks-momentum?days=${d}&station=${enc}&limit=20`, `top-tracks-momentum · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/top-artists?days=${d}&station=${enc}&limit=20`, `top-artists · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/recent-plays?days=${d}&station=${enc}&limit=20`, `recent-plays · days=${d}, station=${exampleStation}`],
            );
        }
        for (const [href, label] of dataStatLinks) {
            html += `<li><a href="${href}">${label}</a></li>`;
        }

        html += "<li style='margin-top:30px'>Channels List:</li>";
        for (let channelID in channelsList) {
            html += `<li>${channelID} (<a href="/api/debug/fetch/${channelID}">Debug Fetch</a>)</li>`;
        }

        res.send(`<ul>${html}</ul>`);
    });

    router.get('/debug/fetch/:chartID', async (req, res) => {
        let chartID = req.params.chartID;
        let output = [];
        let songListHTML = '';
        let trackIds = [];

        try {
            let items = Object.assign({}, stations, charts);
            let props = items[chartID];
            let rawURL = Buffer.from(props.scraper.url, 'base64').toString('ascii');

            let formattedStationParserInfo = await prettier.format(JSON.stringify(props), { semi: false, parser: 'json' });
            output.push(`formattedStationParserInfo: ${chartID}`);
            output.push(`URL: ${rawURL}`);
            output.push(formattedStationParserInfo);

            const chartRPC = await getChartInfo(chartID, props);
            const RPCInfo = await addSpotifyHyperLinks(chartRPC);
            const formattedRPCInfo = await prettier.format(JSON.stringify(RPCInfo), { semi: false, parser: 'json' });

            output.push(`chartRPC: ${chartID}`);
            output.push(formattedRPCInfo);

            trackIds = (RPCInfo.fields || []).map(field => field.SPOTIFY_TRACK_ID).filter(Boolean);

            songListHTML = `<h2>PlayList</h2><ol id="playlist">${
                (RPCInfo.fields || []).map((field, i) =>
                    `<li id="track-${i}" class="track_item" data-index="${i}">` +
                        `${field.artist} - ${field.title} ` +
                        `${field.SPOTIFY_PLAY_BUTTON || ''} ` +
                        `${field.SPOTIFY_APP_PLAY_DEEPLINK || ''}` +
                    `</li>`
                ).join('')
            }</ol>`;

        } catch (error) {
            output.push(`Error: ${chartID}`);
            output.push(error);
        }

        res.send(`
            <html>
              <head>
                <title>Debug Fetch</title>
                <style>
                  #playlist li { padding: 2px 6px; }
                  #playlist li.now-playing {
                    font-weight: bold;
                    list-style-type: '▶ ';
                  }
                </style>
              </head>
              <body>
                <div id="embed-iframe"></div>
                ${songListHTML}
                <script src="https://open.spotify.com/embed/iframe-api/v1" async></script>
                <script type="text/javascript">
                    const trackIds = ${JSON.stringify(trackIds)};

                    let currentIndex = 0;

                    function updateNowPlaying(index) {
                        document.querySelectorAll('#playlist li').forEach((li, i) => {
                            li.classList.toggle('now-playing', i === index);
                        });
                    }

                    window.onSpotifyIframeApiReady = (IFrameAPI) => {
                        const element = document.getElementById('embed-iframe');
                        
                        const options = {
                            width: '100%',
                            height: '160',
                            uri: trackIds[currentIndex],
                        };

                        const callback = (EmbedController) => {
                            let trackEndFired = false;
                            updateNowPlaying(currentIndex);

                            document.querySelectorAll('.track_item').forEach(track => {
                                track.addEventListener('click', () => {
                                    const idx = parseInt(track.dataset.index, 10);
                                    currentIndex = idx;
                                    trackEndFired = false;
                                    updateNowPlaying(currentIndex);
                                    EmbedController.loadUri(trackIds[idx]);
                                    EmbedController.play();
                                });
                            });

                            EmbedController.addListener('playback_update', e => {
                                const { position, duration } = e.data;
                                
                                if (!trackEndFired && duration > 0 && position >= duration - 0.5) {
                                    trackEndFired = true;
                                    currentIndex++;
                                    
                                    if (currentIndex < trackIds.length) {
                                        trackEndFired = false;
                                        updateNowPlaying(currentIndex);
                                        EmbedController.loadUri(trackIds[currentIndex]);
                                        EmbedController.play();
                                    } else {
                                        console.log("End of custom playlist!");
                                    }
                                }
                            });
                        };
                        
                        IFrameAPI.createController(element, options, callback);
                    };
                </script>
                <pre>${output.join('\n')}</pre>
              </body>
            </html>
        `);
    });

    return router;
}
