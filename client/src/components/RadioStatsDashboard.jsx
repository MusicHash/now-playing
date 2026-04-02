import { useEffect, useRef, useState } from 'react';
import PlaysByDayChart from './PlaysByDayChart.jsx';
import RankedBarChart from './RankedBarChart.jsx';
import StatsControls from './StatsControls.jsx';
import {
    clampInt,
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    fetchJson,
    getPlaysByDayUrl,
    getStationsUrl,
    getTopStationsUrl,
    getTopTracksUrl,
    MAX_STATS_DAYS,
    MAX_STATS_LIMIT,
    mergeStationIds,
} from '../lib/statsApi.js';

function useChartWidth() {
    const ref = useRef(null);
    const [width, setWidth] = useState(640);
    useEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }
        const measure = () => {
            setWidth(Math.max(280, Math.floor(el.getBoundingClientRect().width)));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, width];
}

export default function RadioStatsDashboard() {
    const [days, setDays] = useState(DEFAULT_STATS_DAYS);
    const [limit, setLimit] = useState(DEFAULT_STATS_LIMIT);
    const [station, setStation] = useState('');
    const [stationOptions, setStationOptions] = useState([]);

    const [playsData, setPlaysData] = useState(null);
    const [playsLoading, setPlaysLoading] = useState(true);
    const [playsError, setPlaysError] = useState(null);

    const [rankedData, setRankedData] = useState(null);
    const [rankedLoading, setRankedLoading] = useState(true);
    const [rankedError, setRankedError] = useState(null);

    const [containerRef, chartWidth] = useChartWidth();

    useEffect(() => {
        fetchJson(getStationsUrl())
            .then((body) => {
                setStationOptions(mergeStationIds(body.configured, body.logged));
            })
            .catch(() => {
                setStationOptions([]);
            });
    }, []);

    useEffect(() => {
        let cancelled = false;
        setPlaysLoading(true);
        setPlaysError(null);
        (async () => {
            try {
                const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
                const data = await fetchJson(getPlaysByDayUrl({ days: d, station }));
                if (!cancelled) {
                    setPlaysData(data);
                }
            } catch (e) {
                if (!cancelled) {
                    setPlaysError(e);
                }
            } finally {
                if (!cancelled) {
                    setPlaysLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [days, station]);

    useEffect(() => {
        let cancelled = false;
        setRankedLoading(true);
        setRankedError(null);
        (async () => {
            try {
                const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
                const l = clampInt(limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
                const url = station
                    ? getTopTracksUrl({ days: d, limit: l, station })
                    : getTopStationsUrl({ days: d, limit: l });
                const data = await fetchJson(url);
                if (!cancelled) {
                    setRankedData(data);
                }
            } catch (e) {
                if (!cancelled) {
                    setRankedError(e);
                }
            } finally {
                if (!cancelled) {
                    setRankedLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [days, limit, station]);

    const onDaysChange = (n) => setDays(clampInt(n, DEFAULT_STATS_DAYS, MAX_STATS_DAYS));
    const onLimitChange = (n) => setLimit(clampInt(n, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT));

    const rankedMode = station ? 'tracks' : 'stations';

    return (
        <section style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 1rem', color: '#0f172a' }}>
                Radio stats
            </h2>
            <StatsControls
                days={days}
                onDaysChange={onDaysChange}
                limit={limit}
                onLimitChange={onLimitChange}
                station={station}
                onStationChange={setStation}
                stationOptions={stationOptions}
            />
            <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                <PlaysByDayChart
                    data={playsData}
                    width={chartWidth}
                    loading={playsLoading}
                    error={playsError}
                />
                <RankedBarChart
                    data={rankedData}
                    width={chartWidth}
                    loading={rankedLoading}
                    error={rankedError}
                    mode={rankedMode}
                />
            </div>
        </section>
    );
}
