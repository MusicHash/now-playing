import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DrillDownPlaysPanel from './DrillDownPlaysPanel.jsx';
import HourWeekdayHeatmap from './HourWeekdayHeatmap.jsx';
import PlaysByDayChart from './PlaysByDayChart.jsx';
import RankedBarChart from './RankedBarChart.jsx';
import StatsControls from './StatsControls.jsx';
import TrackMomentumChart from './TrackMomentumChart.jsx';
import {
    patchMetricsDrill,
    patchMetricsFilters,
    parseBucket,
    parseDays,
    parseLimit,
    parseMetricsDrill,
    parseMomentum,
    parseStation,
} from '../lib/appSearchParams.js';
import {
    clampInt,
    DEFAULT_BUCKET_MINUTES,
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    fetchJson,
    getPlaysByDayUrl,
    getPlaysByHourWeekdayUrl,
    getStationsUrl,
    getTopArtistsMomentumUrl,
    getTopArtistsUrl,
    getTopStationsUrl,
    getTopTracksMomentumUrl,
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
    const [searchParams, setSearchParams] = useSearchParams();
    const [stationOptions, setStationOptions] = useState([]);

    const days = useMemo(() => parseDays(searchParams), [searchParams]);
    const limit = useMemo(() => parseLimit(searchParams), [searchParams]);
    const station = useMemo(() => parseStation(searchParams), [searchParams]);
    const momentumDirection = useMemo(() => parseMomentum(searchParams), [searchParams]);
    const drill = useMemo(() => parseMetricsDrill(searchParams), [searchParams]);
    const bucketMinutes = useMemo(
        () => (drill ? parseBucket(searchParams) : DEFAULT_BUCKET_MINUTES),
        [searchParams, drill],
    );

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

    const [heatmapData, setHeatmapData] = useState(null);
    const [heatmapLoading, setHeatmapLoading] = useState(true);
    const [heatmapError, setHeatmapError] = useState(null);

    const [stationsData, setStationsData] = useState(null);
    const [stationsLoading, setStationsLoading] = useState(true);
    const [stationsError, setStationsError] = useState(null);

    const [artistMomentumData, setArtistMomentumData] = useState(null);
    const [artistMomentumLoading, setArtistMomentumLoading] = useState(true);
    const [artistMomentumError, setArtistMomentumError] = useState(null);

    const [containerRef, chartWidth] = useChartWidth();

    const onDaysChange = useCallback(
        (n) => {
            const v = clampInt(n, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
            setSearchParams(patchMetricsFilters(searchParams, { days: v }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const onLimitChange = useCallback(
        (n) => {
            const v = clampInt(n, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
            setSearchParams(patchMetricsFilters(searchParams, { limit: v }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const onStationChange = useCallback(
        (s) => {
            setSearchParams(patchMetricsFilters(searchParams, { station: s }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const onMomentumChange = useCallback(
        (dir) => {
            setSearchParams(patchMetricsFilters(searchParams, { momentum: dir }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const onBucketChange = useCallback(
        (n) => {
            setSearchParams(patchMetricsFilters(searchParams, { bucket: n }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const handleTrackRowClick = useCallback(
        (row) => {
            const id = row.spotify_track_id;
            if (typeof id !== 'string' || !id.trim()) {
                return;
            }
            const title = String(row.spotify_track_title ?? '');
            const artist = String(row.spotify_artist_title ?? row.log_artist ?? '');
            const label = `${title} — ${artist}`.trim() || id;
            const next = patchMetricsDrill(
                new URLSearchParams(searchParams),
                { type: 'track', trackId: id.trim(), label },
            );
            setSearchParams(next, { replace: false });
        },
        [searchParams, setSearchParams],
    );

    const handleArtistRowClick = useCallback(
        (row) => {
            const name = row.log_artist;
            if (typeof name !== 'string' || !name.trim()) {
                return;
            }
            const label = name.trim();
            const next = patchMetricsDrill(new URLSearchParams(searchParams), {
                type: 'artist',
                artistName: label,
                label,
            });
            setSearchParams(next, { replace: false });
        },
        [searchParams, setSearchParams],
    );

    const closeDrill = useCallback(() => {
        const next = patchMetricsDrill(new URLSearchParams(searchParams), null);
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

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
        setHeatmapLoading(true);
        setHeatmapError(null);
        (async () => {
            try {
                const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
                const data = await fetchJson(getPlaysByHourWeekdayUrl({ days: d, station }));
                if (!cancelled) {
                    setHeatmapData(data);
                }
            } catch (e) {
                if (!cancelled) {
                    setHeatmapError(e);
                }
            } finally {
                if (!cancelled) {
                    setHeatmapLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [days, station]);

    useEffect(() => {
        if (station) {
            setStationsData(null);
            setStationsLoading(false);
            setStationsError(null);
            return;
        }
        let cancelled = false;
        setStationsLoading(true);
        setStationsError(null);
        (async () => {
            try {
                const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
                const l = clampInt(limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
                const data = await fetchJson(getTopStationsUrl({ days: d, limit: l }));
                if (!cancelled) {
                    setStationsData(data);
                }
            } catch (e) {
                if (!cancelled) {
                    setStationsError(e);
                }
            } finally {
                if (!cancelled) {
                    setStationsLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [days, limit, station]);

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

    useEffect(() => {
        let cancelled = false;
        setArtistMomentumLoading(true);
        setArtistMomentumError(null);
        const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
        const l = clampInt(limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
        const url = getTopArtistsMomentumUrl({
            days: d,
            limit: l,
            station,
            direction: momentumDirection,
        });
        (async () => {
            try {
                const data = await fetchJson(url);
                if (!cancelled) {
                    setArtistMomentumData(data);
                }
            } catch (e) {
                if (!cancelled) {
                    setArtistMomentumError(e);
                }
            } finally {
                if (!cancelled) {
                    setArtistMomentumLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [days, limit, station, momentumDirection]);

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
                onStationChange={onStationChange}
                stationOptions={stationOptions}
            />
            <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                <PlaysByDayChart
                    data={playsData}
                    width={chartWidth}
                    loading={playsLoading}
                    error={playsError}
                />
                <HourWeekdayHeatmap
                    data={heatmapData}
                    width={chartWidth}
                    loading={heatmapLoading}
                    error={heatmapError}
                    scopeAllStations={!station}
                />
                {!station && (
                    <RankedBarChart
                        data={stationsData}
                        width={chartWidth}
                        loading={stationsLoading}
                        error={stationsError}
                        mode="stations"
                        scopeAllStations
                    />
                )}
                <TrackMomentumChart
                    data={momentumData}
                    width={chartWidth}
                    loading={momentumLoading}
                    error={momentumError}
                    scopeAllStations={!station}
                    direction={momentumDirection}
                    onDirectionChange={onMomentumChange}
                    onRowClick={handleTrackRowClick}
                />
                <TrackMomentumChart
                    data={artistMomentumData}
                    width={chartWidth}
                    loading={artistMomentumLoading}
                    error={artistMomentumError}
                    scopeAllStations={!station}
                    entityType="artist"
                    showDirectionControl={false}
                    direction={momentumDirection}
                    onRowClick={handleArtistRowClick}
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
                        resolutionMinutes={bucketMinutes}
                        onResolutionMinutesChange={onBucketChange}
                        onClose={closeDrill}
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
