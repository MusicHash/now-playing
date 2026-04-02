import { Router } from 'express';

import MySQLWrapper from '../utils/mysql_wrapper.js';
import { stations, charts } from '../../config/sources.js';
import {
    getDistinctStationsLogged,
    getMostPlayedTracks,
    getPlaysByDay,
    getRecentPlays,
    getTopArtists,
    getTopStations,
} from '../lib/query_log/stats_queries.js';

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
    return {
        days: req.query.days,
        limit: req.query.limit,
        station,
        stationLike,
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
            res.json({ configured, logged });
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

    router.get('/data/stats/top-tracks', async (req, res) => {
        try {
            const rows = await getMostPlayedTracks(parseQuery(req));
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

    return router;
}
