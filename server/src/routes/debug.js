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
import {
    backfillSpotifyAudioFeaturesBatch,
    isAudioFeaturesApiConfigured,
} from '../lib/spotify_audio_features_backfill.js';

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

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

function requireAudioFeaturesApiForBackfill(_req, res, next) {
    if (!isAudioFeaturesApiConfigured()) {
        res.status(503).json({
            error: 'SPOTIFY_AUDIO_FEATURES_API_URL is not set in the server process',
            enabled: false,
            hint: 'The API server reads repo-root .env (npm run start/debug: --env-file ../.env from server/). Env files for other packages in this repo are not loaded.',
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
        const backfillAudioFeaturesLi = isAudioFeaturesApiConfigured()
            ? `<li><a href="/api/debug/backfill_spotify_audio_features?limit=25&amp;autoreload=1&amp;autoreload_sec=30">Backfill Spotify track audio features</a> (streaming log; optional countdown reload — add <code>autoreload=0</code> for plain text)</li>`
            : '';
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
    <li><a href="/api/actions">All API actions</a></li>
    ${backfillAudioFeaturesLi}
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
            '/api/debug/backfill_spotify_audio_features?limit=25&autoreload=1&autoreload_sec=30':
                'Backfill Spotify track audio features (streaming + auto next batch unless you stop countdown)',
            '/api/debug/magical-moment': 'Magical moment (JSON: window of plays per station)',
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

    const runBackfillAudioFeatures = async (req, res) => {
        const ar = req.query.autoreload;
        const htmlMode = ar === '1' || ar === 'true';

        let autoreloadSec = Number.parseInt(String(req.query.autoreload_sec ?? '30'), 10);
        if (!Number.isFinite(autoreloadSec)) {
            autoreloadSec = 30;
        }
        autoreloadSec = Math.min(600, Math.max(5, autoreloadSec));

        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');

        if (htmlMode) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        }

        let clientClosed = false;
        req.on('close', () => {
            clientClosed = true;
        });

        const writeLine = (line) => {
            if (!clientClosed && !res.writableEnded) {
                const chunk = htmlMode ? `${escapeHtml(line)}\n` : `${line}\n`;
                res.write(chunk);
            }
        };

        if (typeof res.flushHeaders === 'function') {
            res.flushHeaders();
        }

        if (htmlMode) {
            res.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Spotify audio features backfill</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1rem; line-height: 1.45; background: #f4f4f5; color: #1a1a1a; }
    pre#log { white-space: pre-wrap; word-break: break-word; background: #1a1a1a; color: #e8e8e8; padding: 1rem; border-radius: 8px; font-size: 13px; max-height: 65vh; overflow: auto; margin: 0; }
    #countdown-wrap { margin-top: 1rem; padding: 1rem; background: #fff; border: 1px solid #ccc; border-radius: 8px; }
    button { font: inherit; padding: 0.4rem 0.85rem; cursor: pointer; border-radius: 6px; border: 1px solid #888; background: #fff; margin-left: 0.5rem; }
    button:hover { background: #eee; }
  </style>
</head>
<body>
<pre id="log">`);
        }

        try {
            writeLine(
                'Tracks: no row in nowplaying_spotify_track_audio_features, and not in tmp_nowplaying_spotify_track_audio_features_404 (prior sidecar 404s). One HTTP call per track.',
            );

            const summary = await backfillSpotifyAudioFeaturesBatch(logger, {
                limit: req.query.limit,
                isAborted: () => clientClosed || res.writableEnded,
                onBatchStart: ({ requested_limit, candidates_selected }) => {
                    writeLine(
                        `Progress: batch_limit=${requested_limit}, selected=${candidates_selected} (processing sequentially).`,
                    );
                },
                onProgress: (p) => {
                    const song = `${p.spotify_artist_title} - ${p.spotify_track_title}`;
                    const rt =
                        p.response_time_ms != null ? ` api_response_ms=${p.response_time_ms}` : '';
                    const http = p.http_status != null ? ` http=${p.http_status}` : '';
                    writeLine(
                        `[${p.index}/${p.total}] ${song} | track_id=${p.spotify_track_id} | ${p.outcome} | request_ms=${p.elapsed_ms}${rt}${http}`,
                    );
                },
            });

            writeLine('--- summary ---');
            for (const [k, v] of Object.entries(summary)) {
                writeLine(`${k}: ${v}`);
            }

            if (htmlMode) {
                res.write(`</pre>
<div id="countdown-wrap">
  <p id="cd-msg">Next batch in <strong id="cd-n"></strong>s — same URL reloads (limit and options preserved). <button type="button" id="cd-stop">Stop countdown</button></p>
</div>
<script>
(function () {
  var sec = ${autoreloadSec};
  var n = document.getElementById('cd-n');
  var msg = document.getElementById('cd-msg');
  var btn = document.getElementById('cd-stop');
  var left = sec;
  if (n) n.textContent = String(left);
  var t = setInterval(function () {
    left -= 1;
    if (left <= 0) {
      clearInterval(t);
      location.reload();
      return;
    }
    if (n) n.textContent = String(left);
  }, 1000);
  if (btn) {
    btn.addEventListener('click', function () {
      clearInterval(t);
      msg.textContent = 'Autoreload cancelled. Run another batch from the link or refresh when ready.';
      btn.remove();
    });
  }
})();
</script>
</body>
</html>`);
            }
            res.end();
        } catch (error) {
            logger.error({
                method: 'debug.backfill_spotify_audio_features',
                message: 'Audio features backfill failed',
                error,
            });
            if (!res.headersSent) {
                res.status(500);
            }
            writeLine(`ERROR: ${error?.message || error}`);
            if (htmlMode && !res.writableEnded) {
                res.write(
                    '</pre><p style="color:#b00020;font-weight:600">Batch failed — autoreload skipped.</p></body></html>',
                );
            }
            res.end();
        }
    };

    router.get(
        '/debug/backfill_spotify_audio_features',
        requireMysqlForDebug,
        requireAudioFeaturesApiForBackfill,
        runBackfillAudioFeatures,
    );
    router.post(
        '/debug/backfill_spotify_audio_features',
        requireMysqlForDebug,
        requireAudioFeaturesApiForBackfill,
        runBackfillAudioFeatures,
    );

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
