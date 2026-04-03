import { useCallback, useEffect, useRef, useState } from 'react';
import DrillDownPlaysPanel from './DrillDownPlaysPanel.jsx';
import PlaysByDayChart from './PlaysByDayChart.jsx';
import RankedBarChart from './RankedBarChart.jsx';
import StatsControls from './StatsControls.jsx';
import TrackMomentumChart from './TrackMomentumChart.jsx';
import {
    clampInt,
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    fetchJson,
    getPlaysByDayUrl,
    getStationsUrl,
    getTopArtistsUrl,
    getTopTracksMomentumUrl,
    getTopTracksUrl,
    MAX_STATS_DAYS,
    MAX_STATS_LIMIT,
    mergeStationIds,
    MOMENTUM_DIRECTION_UP,
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

    const [artistsData, setArtistsData] = useState(null);
    const [artistsLoading, setArtistsLoading] = useState(true);
    const [artistsError, setArtistsError] = useState(null);

    const [momentumData, setMomentumData] = useState(null);
    const [momentumLoading, setMomentumLoading] = useState(true);
    const [momentumError, setMomentumError] = useState(null);
    const [momentumDirection, setMomentumDirection] = useState(MOMENTUM_DIRECTION_UP);

    const [containerRef, chartWidth] = useChartWidth();

    const [drill, setDrill] = useState(null);

    const handleTrackRowClick = useCallback((row) => {
        const id = row.spotify_track_id;
        if (typeof id !== 'string' || !id.trim()) {
            return;
        }
        const title = String(row.spotify_track_title ?? '');
        const artist = String(row.spotify_artist_title ?? row.log_artist ?? '');
        const label = `${title} — ${artist}`.trim() || id;
        setDrill({ type: 'track', trackId: id.trim(), label });
    }, []);

    const handleArtistRowClick = useCallback((row) => {
        const name = row.log_artist;
        if (typeof name !== 'string' || !name.trim()) {
            return;
        }
        const label = name.trim();
        setDrill({ type: 'artist', artistName: label, label });
    }, []);

    useEffect(() => {
        fetchJson(getStationsUrl())
            .then((body) => {
                setStationOptions(mergeStationIds([], body.logged));
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
        setArtistsLoading(true);
        setArtistsError(null);

        const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
        const l = clampInt(limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
        const rankedUrl = getTopTracksUrl({ days: d, limit: l, station });
        const artistsUrl = getTopArtistsUrl({ days: d, limit: l, station });

        (async () => {
            try {
                const data = await fetchJson(rankedUrl);
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

        (async () => {
            try {
                const data = await fetchJson(artistsUrl);
                if (!cancelled) {
                    setArtistsData(data);
                }
            } catch (e) {
                if (!cancelled) {
                    setArtistsError(e);
                }
            } finally {
                if (!cancelled) {
                    setArtistsLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [days, limit, station]);

    useEffect(() => {
        let cancelled = false;
        setMomentumLoading(true);
        setMomentumError(null);
        const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
        const l = clampInt(limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
        const url = getTopTracksMomentumUrl({
            days: d,
            limit: l,
            station,
            direction: momentumDirection,
        });
        (async () => {
            try {
                const data = await fetchJson(url);
                if (!cancelled) {
                    setMomentumData(data);
                }
            } catch (e) {
                if (!cancelled) {
                    setMomentumError(e);
                }
            } finally {
                if (!cancelled) {
                    setMomentumLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [days, limit, station, momentumDirection]);

    const onDaysChange = (n) => setDays(clampInt(n, DEFAULT_STATS_DAYS, MAX_STATS_DAYS));
    const onLimitChange = (n) => setLimit(clampInt(n, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT));

    return (
        <section style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: '0 0 1rem', color: '#0f172a' }}>
                Play metrics
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
                <TrackMomentumChart
                    data={momentumData}
                    width={chartWidth}
                    loading={momentumLoading}
                    error={momentumError}
                    scopeAllStations={!station}
                    direction={momentumDirection}
                    onDirectionChange={setMomentumDirection}
                    onRowClick={handleTrackRowClick}
                />
                {drill && (
                    <DrillDownPlaysPanel
                        key={
                            drill.type === 'track'
                                ? `track:${drill.trackId}`
                                : `artist:${drill.artistName}`
                        }
                        drill={drill}
                        days={days}
                        station={station}
                        width={chartWidth}
                        onClose={() => setDrill(null)}
                    />
                )}
                <RankedBarChart
                    data={rankedData}
                    width={chartWidth}
                    loading={rankedLoading}
                    error={rankedError}
                    mode="tracks"
                    scopeAllStations={!station}
                    onRowClick={handleTrackRowClick}
                />
                <RankedBarChart
                    data={artistsData}
                    width={chartWidth}
                    loading={artistsLoading}
                    error={artistsError}
                    mode="artists"
                    scopeAllStations={!station}
                    onRowClick={handleArtistRowClick}
                />
            </div>
        </section>
    );
}
