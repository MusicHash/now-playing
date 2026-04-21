import { Router } from 'express';
import prettier from 'prettier';

import { handleMagicalMoment } from './data.js';
import MySQLWrapper, { SQL_CACHE_REDIS_PATTERN } from '../utils/mysql_wrapper.js';
import {
    getChartInfo,
    crawlHistoryChartsToNotifyTrackChanges,
    updatePlaylistContentForAllStations,
} from '../lib/fetch_sources.js';
import { addSpotifyHyperLinks } from '../utils/spotify_link_generator.js';
import { DEFAULT_STATS_DAYS } from '../lib/query_log/stats_queries.js';
import { getYearWeek } from '../lib/query_log/chart_log.js';
import { stations, charts, historyCharts } from '../../config/sources.js';
import redisWrapper from '../utils/redis_wrapper.js';
import { backfillSpotifyIsrcBatch, DEFAULT_ISRC_BACKFILL_DB_BATCH } from '../lib/spotify_isrc_backfill.js';
import { backfillSpotifyIsrcFromSongRedisCache } from '../lib/spotify_isrc_backfill_song_cache.js';

function requireMysqlForDebug(_req, res, next) {
    if (!MySQLWrapper.isEnabled()) {
        res.status(503).json({
            error: 'MySQL is not configured',
            enabled: false,
        });
        return;
    }
    next();
}

export default function debugRoutes(logger) {
    const router = Router();

    const runHistoryChartsCrawl = async (req, res) => {
        try {
            await crawlHistoryChartsToNotifyTrackChanges();
            res.send('Success, crawlHistoryChartsToNotifyTrackChanges finished.');
        } catch (error) {
            logger.error({
                method: 'debug.crawl_history_charts',
                message: 'Manual history charts crawl failed',
                error,
            });
            res.status(500).send(`Error: ${error?.message || error}`);
        }
    };

    const runUpdatePlaylists = async (req, res) => {
        try {
            await updatePlaylistContentForAllStations();
            res.send('Success, updatePlaylistContentForAllStations queued (same as 24h scheduler job).');
        } catch (error) {
            logger.error({
                method: 'debug.update_playlists',
                message: 'Manual playlist update failed',
                error,
            });
            res.status(500).send(`Error: ${error?.message || error}`);
        }
    };

    const runBackfillSpotifyIsrc = async (req, res) => {
        try {
            const raw =
                req.query?.limit ??
                (typeof req.body === 'object' && req.body !== null ? req.body.limit : undefined);
            const result = await backfillSpotifyIsrcBatch({ limit: raw });
            res.json({ ok: true, ...result });
        } catch (error) {
            if (error?.code === 'REDIS_DISABLED') {
                res.status(503).json({ ok: false, error: 'Redis is not configured' });
                return;
            }
            if (error?.code === 'MYSQL_DISABLED') {
                res.status(503).json({ ok: false, error: 'MySQL is not configured' });
                return;
            }
            logger.error({
                method: 'actions.backfill_spotify_isrc',
                message: 'ISRC backfill batch failed',
                error,
            });
            res.status(500).json({ ok: false, error: String(error?.message || error) });
        }
    };

    /** ONE-TIME: delete handler + `spotify_isrc_backfill_song_cache.js` when done. */
    const runBackfillSpotifyIsrcFromSongCache = async (req, res) => {
        try {
            const q = req.method === 'GET' ? req.query : { ...req.query, ...req.body };
            const maxKeys = q?.maxKeys ?? q?.limit;
            const dryRaw = q?.dryRun ?? q?.dry_run;
            const dryRun =
                dryRaw === true ||
                dryRaw === '1' ||
                dryRaw === 'true' ||
                dryRaw === 'yes';
            const result = await backfillSpotifyIsrcFromSongRedisCache({
                maxKeys,
                dryRun,
            });
            res.json({ ok: true, ...result });
        } catch (error) {
            if (error?.code === 'REDIS_DISABLED') {
                res.status(503).json({ ok: false, error: 'Redis is not configured' });
                return;
            }
            if (error?.code === 'MYSQL_DISABLED') {
                res.status(503).json({ ok: false, error: 'MySQL is not configured' });
                return;
            }
            logger.error({
                method: 'actions.backfill_spotify_isrc_from_song_cache',
                message: 'SONG:* ISRC backfill failed',
                error,
            });
            res.status(500).json({ ok: false, error: String(error?.message || error) });
        }
    };

    const runPurgeSqlCache = async (req, res) => {
        try {
            const { deleted } = await redisWrapper.purgeKeyPattern(SQL_CACHE_REDIS_PATTERN);
            res.type('text').send(
                `Success, purged ${deleted} Redis key(s) matching ${SQL_CACHE_REDIS_PATTERN} (MySQL query result cache).`,
            );
        } catch (error) {
            logger.error({
                method: 'debug.purge_sql_cache',
                message: 'Purge SQL Redis cache failed',
                error,
            });
            res.status(500).send(`Error: ${error?.message || error}`);
        }
    };

    router.get('/debug', (req, res) => {
        res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Now Playing · Debug</title>
</head>
<body>
  <h1>Debug</h1>
  <ul>
    <li><a href="/api/debug/crawl_history_charts">Run history charts crawl now</a> (same as scheduler: every 5 minutes)</li>
    <li><a href="/api/debug/update_playlists">Update station playlists now</a> (same as scheduler 24h job — queues per-station updates)</li>
    <li><a href="/api/debug/purge_sql_cache">Purge Redis SQL query cache</a> (<code>sql_cache:*</code>)</li>
    <li><a href="/api/debug/magical-moment">Magical moment</a> (JSON: plays per station in a time window — same as <code>/api/data/stats/magical-moment</code>)</li>
    <li><a href="/api/actions/backfill_spotify_isrc">Backfill Spotify ISRC</a> (JSON: Redis-only from <code>SPOTIFY_TRACK_ISRC:*</code> keys)</li>
    <li><a href="/api/actions/backfill_spotify_isrc_from_song_cache">ONE-TIME: Backfill ISRC from Redis <code>SONG:*</code> cached search JSON</a> (<code>?dryRun=1</code>, <code>?maxKeys=</code>)</li>
    <li><a href="/api/actions">All API actions</a></li>
  </ul>
</body>
</html>`);
    });

    router.get('/actions', async (req, res) => {
        const chartYearWeek = getYearWeek();
        const chartYear = Math.floor(chartYearWeek / 100);
        const chartWeekNum = chartYearWeek % 100;
        let links = {
            '/api/spotify/login': 'Re-Login',
            '/api/crawl_playlists_manually': 'Crawl Stations (all)',
            '/api/update_playlists_manually': 'Update Stations Manually (all)',
            '/api/playlist/refresh_charts/all': 'Refresh Charts - in batches (all)',
            '/api/playlist/collect_charts/all': `Collect Charts to DB (all, skips if week exists) — ${chartYear}+${chartWeekNum}`,
            '/api/playlist/sync_charts/all': 'Sync Charts to Spotify from DB (all)',
            '/api/playlist/slice/all': 'Shorten the playlist to limit (all)',
            '/api/debug_channels': 'Debug Channels',
            '/api/debug': 'Debug · index (manual triggers)',
            '/api/debug/crawl_history_charts': 'Crawl History Charts (5 min schedule, run now)',
            '/api/debug/update_playlists': 'Update Station Playlists (24h job, run now)',
            '/api/debug/purge_sql_cache': 'Purge Redis SQL query cache (sql_cache:*)',
            '/api/debug/magical-moment': 'Magical moment (JSON: window of plays per station)',
            '/api/actions/backfill_spotify_isrc': `Backfill Spotify ISRC from Redis cache only (batch ${DEFAULT_ISRC_BACKFILL_DB_BATCH}; ?limit=)`,
            '/api/actions/backfill_spotify_isrc_from_song_cache':
                'ONE-TIME: Backfill ISRC from Redis SONG:* cached Spotify search JSON (?dryRun=1 ?maxKeys=)',
        };

        let html = Object.keys(links)
            .map(function (result, item) {
                return `<li><a href="${result}">${links[result]}</a></li>`;
            }, 0)
            .join('\r\n');

        let channelsList = Object.assign({}, stations, charts, historyCharts);
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
            [`/api/data/stats/playlist-tracks?days=${d}&limit=25&sort=play_count`, `playlist-tracks · days=${d}, sort=play_count`],
            [`/api/data/stats/playlist-tracks?days=${d}&limit=25&sort=recent`, `playlist-tracks · days=${d}, sort=recent`],
            [`/api/data/stats/top-tracks?days=${d}&stationLike=glz&limit=20`, `top-tracks · days=${d}, stationLike=glz`],
            ['/api/data/stats/magical-moment?minutes=5', 'magical-moment · last 5 minutes (all stations, end = now)'],
            ['/api/debug/magical-moment?minutes=5', 'magical-moment (debug alias) · last 5 minutes'],
        ];
        if (exampleStation) {
            const enc = encodeURIComponent(exampleStation);
            dataStatLinks.push(
                [`/api/data/stats/plays-by-day?days=${d}&station=${enc}`, `plays-by-day · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/top-tracks?days=${d}&station=${enc}&limit=20`, `top-tracks · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/top-tracks-momentum?days=${d}&station=${enc}&limit=20`, `top-tracks-momentum · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/top-artists?days=${d}&station=${enc}&limit=20`, `top-artists · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/recent-plays?days=${d}&station=${enc}&limit=20`, `recent-plays · days=${d}, station=${exampleStation}`],
                [`/api/data/stats/playlist-tracks?days=${d}&station=${enc}&limit=20&sort=recent`, `playlist-tracks · days=${d}, station=${exampleStation}, sort=recent`],
            );
        }
        for (const [href, label] of dataStatLinks) {
            html += `<li><a href="${href}">${label}</a></li>`;
        }

        html += "<li style='margin-top:30px'>Channels List:</li>";
        for (let channelID in channelsList) {
            html += `<li>${channelID} (<a href="/api/debug/fetch/${encodeURIComponent(channelID)}">Debug Fetch</a>)</li>`;
        }

        res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Now Playing · Debug · API actions</title>
</head>
<body>
<ul>${html}</ul>
</body>
</html>`);
    });

    router.get('/debug/crawl_history_charts', runHistoryChartsCrawl);
    router.post('/debug/crawl_history_charts', runHistoryChartsCrawl);

    router.get('/debug/update_playlists', runUpdatePlaylists);
    router.post('/debug/update_playlists', runUpdatePlaylists);

    router.get('/debug/purge_sql_cache', runPurgeSqlCache);
    router.post('/debug/purge_sql_cache', runPurgeSqlCache);

    router.get('/debug/magical-moment', requireMysqlForDebug, handleMagicalMoment);
    router.post('/debug/magical-moment', requireMysqlForDebug, handleMagicalMoment);

    router.get('/actions/backfill_spotify_isrc', requireMysqlForDebug, runBackfillSpotifyIsrc);
    router.post('/actions/backfill_spotify_isrc', requireMysqlForDebug, runBackfillSpotifyIsrc);

    router.get('/actions/backfill_spotify_isrc_from_song_cache', requireMysqlForDebug, runBackfillSpotifyIsrcFromSongCache);
    router.post('/actions/backfill_spotify_isrc_from_song_cache', requireMysqlForDebug, runBackfillSpotifyIsrcFromSongCache);

    router.get('/debug/fetch/:chartID', async (req, res) => {
        let chartID = req.params.chartID;
        let output = [];
        let songListHTML = '';
        let trackIds = [];

        try {
            let items = Object.assign({}, stations, charts, historyCharts);
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

        res.type('html').send(`
            <html>
              <head>
                <title>Now Playing · Debug fetch · ${chartID}</title>
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
