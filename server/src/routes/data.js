import { Router } from 'express';

import MySQLWrapper from '../utils/mysql_wrapper.js';
import { stations, charts } from '../../config/sources.js';
import {
    getDistinctStationsLogged,
    getMostPlayedTracks,
    getPlaylistTracks,
    getPlaysByBucketForArtist,
    getPlaysByBucketForTrack,
    getPlaysByDay,
    getPlaysByHourWeekday,
    getRecentPlays,
    getTopArtists,
    getTopArtistsByMomentum,
    getTopStations,
    getTopTracksByMomentum,
} from '../lib/query_log/stats_queries.js';
import { getChartEntries, getAvailableWeeks } from '../lib/query_log/chart_log.js';

function requireMysql(_req, res, next) {
    if (!MySQLWrapper.isEnabled()) {
        res.status(503).json({
            error: 'MySQL is not configured',
            enabled: false,
        });
        return;
    }
    next();
}

function parseQuery(req) {
    const station = typeof req.query.station === 'string' ? req.query.station : undefined;
    const stationLike =
        typeof req.query.stationLike === 'string' ? req.query.stationLike : undefined;
    const direction = typeof req.query.direction === 'string' ? req.query.direction : undefined;
    return {
        days: req.query.days,
        limit: req.query.limit,
        station,
        stationLike,
        direction,
    };
}

export default function dataRoutes(_logger) {
    const router = Router();

    router.use(requireMysql);

    router.get('/data/stations', async (_req, res) => {
        try {
            const configured = [
                ...new Set([...Object.keys(stations), ...Object.keys(charts)]),
            ].sort();
            const logged = await getDistinctStationsLogged();
            const chartList = Object.entries(charts).map(([id, cfg]) => ({
                id,
                label: cfg.now_playing?.title || id,
            }));
            res.json({ configured, logged, charts: chartList });
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/plays-by-day', async (req, res) => {
        try {
            const rows = await getPlaysByDay(parseQuery(req));
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/plays-by-hour-weekday', async (req, res) => {
        try {
            const rows = await getPlaysByHourWeekday(parseQuery(req));
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/top-tracks', async (req, res) => {
        try {
            const rows = await getMostPlayedTracks(parseQuery(req));
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/playlist-tracks', async (req, res) => {
        try {
            const q = parseQuery(req);
            const sort =
                typeof req.query.sort === 'string' ? req.query.sort : undefined;
            const rows = await getPlaylistTracks({ ...q, sort });
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/top-tracks-momentum', async (req, res) => {
        try {
            const rows = await getTopTracksByMomentum(parseQuery(req));
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/top-artists-momentum', async (req, res) => {
        try {
            const rows = await getTopArtistsByMomentum(parseQuery(req));
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/top-artists', async (req, res) => {
        try {
            const rows = await getTopArtists(parseQuery(req));
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/top-stations', async (req, res) => {
        try {
            const q = parseQuery(req);
            const rows = await getTopStations({ days: q.days, limit: q.limit });
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/recent-plays', async (req, res) => {
        try {
            const rows = await getRecentPlays(parseQuery(req));
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/plays-by-bucket/track', async (req, res) => {
        const trackId =
            typeof req.query.spotify_track_id === 'string' ? req.query.spotify_track_id.trim() : '';
        if (!trackId) {
            res.status(400).json({ error: 'spotify_track_id is required' });
            return;
        }
        try {
            const q = parseQuery(req);
            const rows = await getPlaysByBucketForTrack({
                days: q.days,
                station: q.station,
                stationLike: q.stationLike,
                resolutionMinutes: req.query.resolutionMinutes,
                trackId,
            });
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/stats/plays-by-bucket/artist', async (req, res) => {
        const artist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
        if (!artist) {
            res.status(400).json({ error: 'artist is required' });
            return;
        }
        try {
            const q = parseQuery(req);
            const rows = await getPlaysByBucketForArtist({
                days: q.days,
                station: q.station,
                stationLike: q.stationLike,
                resolutionMinutes: req.query.resolutionMinutes,
                artist,
            });
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    router.get('/data/chart-tracks', async (req, res) => {
        const chart = typeof req.query.chart === 'string' ? req.query.chart.trim() : '';
        if (!chart) {
            res.status(400).json({ error: 'chart is required' });
            return;
        }
        const weekRaw = typeof req.query.week === 'string' ? req.query.week.trim() : '';
        const week = weekRaw ? Number(weekRaw) : null;
        if (weekRaw && (!Number.isFinite(week) || week <= 0)) {
            res.status(400).json({ error: 'week must be a positive integer (e.g. 202614)' });
            return;
        }
        try {
            const [tracks, availableWeeks] = await Promise.all([
                getChartEntries(chart, week),
                getAvailableWeeks(chart),
            ]);
            const resolvedWeek = tracks.length > 0 ? tracks[0].chart_year_week : (week || null);
            res.json({
                chart_id: chart,
                chart_year_week: resolvedWeek,
                available_weeks: availableWeeks,
                tracks,
            });
        } catch (error) {
            res.status(500).json({ error: 'Query failed', message: String(error?.message || error) });
        }
    });

    return router;
}
