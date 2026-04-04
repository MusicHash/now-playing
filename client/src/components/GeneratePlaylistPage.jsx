import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PlaysBucketChart from './PlaysBucketChart.jsx';
import SpotifyEmbedPlayer from './SpotifyEmbedPlayer.jsx';
import SpotifyConnectPlayer from './SpotifyConnectPlayer.jsx';
import { consumeHashTokens } from '../lib/spotifyPlayerAuth.js';
import {
    parseChartId,
    parseChartWeek,
    parseDays,
    parseDevice,
    parseLimit,
    parsePlaylistIndex,
    parsePlaylistMode,
    parsePlaylistRun,
    parsePlaylistSort,
    parsePlayType,
    parseStation,
    patchPlaylistState,
    PLAY_TYPE_SHUFFLE,
} from '../lib/appSearchParams.js';
import {
    clampBucketMinutes,
    clampInt,
    DEFAULT_BUCKET_MINUTES,
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    fetchJson,
    getChartTracksUrl,
    getPlaysByBucketTrackUrl,
    getPlaylistTracksUrl,
    getStationsUrl,
    MAX_STATS_DAYS,
    MAX_STATS_LIMIT,
    mergeStationIds,
    PLAYLIST_MODE_CHART,
    PLAYLIST_MODE_PLAYLOG,
    PLAYLIST_SORT_PLAY_COUNT,
    PLAYLIST_SORT_RECENT,
} from '../lib/statsApi.js';

const panelStyle = {
    width: '320px',
    flexShrink: 0,
    borderRight: '1px solid #e2e8f0',
    padding: '1rem 1.25rem',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
};

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.35rem' };
const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#475569' };
const inputStyle = {
    padding: '0.45rem 0.6rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.95rem',
    minWidth: '5rem',
};

const toggleWrapStyle = {
    display: 'flex',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #cbd5e1',
};

function toggleBtnStyle(active) {
    return {
        flex: 1,
        padding: '0.4rem 0.5rem',
        border: 'none',
        background: active ? '#0284c7' : '#f1f5f9',
        color: active ? '#fff' : '#475569',
        fontWeight: 600,
        fontSize: '0.8rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s, color 0.15s',
    };
}

const weekStepperStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
};

const weekBtnStyle = (disabled) => ({
    padding: '0.3rem 0.55rem',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
    background: disabled ? '#f1f5f9' : '#fff',
    color: disabled ? '#94a3b8' : '#0f172a',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    lineHeight: 1,
});

function formatYearWeek(yw) {
    if (!yw) return '';
    const year = Math.floor(yw / 100);
    const week = yw % 100;
    return `Week ${week}, ${year}`;
}

/**
 * @param {number} n list length
 * @param {number} exclude index to avoid (if n > 1)
 */
function randomIndexExcept(n, exclude) {
    if (n <= 0) return 0;
    if (n === 1) return 0;
    let j = exclude;
    while (j === exclude) {
        j = Math.floor(Math.random() * n);
    }
    return j;
}

function useSidebarChartWidth() {
    const ref = useRef(null);
    const [width, setWidth] = useState(280);
    useEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }
        const measure = () => {
            setWidth(Math.max(200, Math.floor(el.getBoundingClientRect().width)));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, width];
}

export default function GeneratePlaylistPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [stationOptions, setStationOptions] = useState([]);
    const [chartOptions, setChartOptions] = useState([]);

    const mode = useMemo(() => parsePlaylistMode(searchParams), [searchParams]);
    const isChartMode = mode === PLAYLIST_MODE_CHART;

    const days = useMemo(() => parseDays(searchParams), [searchParams]);
    const limit = useMemo(() => parseLimit(searchParams), [searchParams]);
    const station = useMemo(() => parseStation(searchParams), [searchParams]);
    const sort = useMemo(() => parsePlaylistSort(searchParams), [searchParams]);
    const runFlag = useMemo(() => parsePlaylistRun(searchParams), [searchParams]);

    const chartId = useMemo(() => parseChartId(searchParams), [searchParams]);
    const chartWeek = useMemo(() => parseChartWeek(searchParams), [searchParams]);
    const deviceParam = useMemo(() => parseDevice(searchParams), [searchParams]);
    const playType = useMemo(() => parsePlayType(searchParams), [searchParams]);

    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [playerSession, setPlayerSession] = useState(0);
    /** Stack of playlist indices visited before the current track (shuffle prev). */
    const [shuffleHistory, setShuffleHistory] = useState([]);

    const urlPlaylistIndex = useMemo(() => parsePlaylistIndex(searchParams), [searchParams]);

    const activeIndex = useMemo(() => {
        if (tracks.length === 0) {
            return 0;
        }
        const fromUrl = urlPlaylistIndex ?? 0;
        return Math.min(Math.max(0, fromUrl), tracks.length - 1);
    }, [tracks.length, urlPlaylistIndex]);

    const [availableWeeks, setAvailableWeeks] = useState([]);
    const [currentWeek, setCurrentWeek] = useState(null);

    const [trackPlaysData, setTrackPlaysData] = useState(null);
    const [trackPlaysAllStationsData, setTrackPlaysAllStationsData] = useState(null);
    const [trackPlaysLoading, setTrackPlaysLoading] = useState(false);
    const [trackPlaysError, setTrackPlaysError] = useState(null);
    const [chartWrapRef, chartWidth] = useSidebarChartWidth();

    const LS_PLAYER_PREF = 'playerPreference';
    const [playerType, setPlayerType] = useState(
        () => localStorage.getItem(LS_PLAYER_PREF) || 'embed',
    );

    useEffect(() => {
        consumeHashTokens();
    }, []);

    const handlePlayerTypeChange = useCallback((type) => {
        setPlayerType(type);
        localStorage.setItem(LS_PLAYER_PREF, type);
    }, []);

    const uris = useMemo(
        () =>
            tracks
                .map((row) => row.spotify_track_id)
                .filter((id) => typeof id === 'string' && id.trim()),
        [tracks],
    );

    const activeSpotifyTrackId = useMemo(() => {
        const row = tracks[activeIndex];
        const id = row?.spotify_track_id;
        return typeof id === 'string' && id.trim() ? id.trim() : '';
    }, [tracks, activeIndex]);

    // --- Plays-over-time for active track ---
    useEffect(() => {
        if (!activeSpotifyTrackId) {
            setTrackPlaysData(null);
            setTrackPlaysAllStationsData(null);
            setTrackPlaysLoading(false);
            setTrackPlaysError(null);
            return;
        }
        let cancelled = false;
        setTrackPlaysLoading(true);
        setTrackPlaysError(null);
        const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
        const res = clampBucketMinutes(DEFAULT_BUCKET_MINUTES);
        const base = {
            days: d,
            resolutionMinutes: res,
            spotify_track_id: activeSpotifyTrackId,
        };
        const stationForBucket = isChartMode ? undefined : station;
        const stationUrl = stationForBucket
            ? getPlaysByBucketTrackUrl({ ...base, station: stationForBucket })
            : null;
        const allStationsUrl = getPlaysByBucketTrackUrl(base);

        const run = stationUrl
            ? Promise.all([fetchJson(stationUrl), fetchJson(allStationsUrl)]).then(([stationRows, allRows]) => {
                  if (!cancelled) {
                      setTrackPlaysData(Array.isArray(stationRows) ? stationRows : []);
                      setTrackPlaysAllStationsData(Array.isArray(allRows) ? allRows : []);
                  }
              })
            : fetchJson(allStationsUrl).then((rows) => {
                  if (!cancelled) {
                      setTrackPlaysData(Array.isArray(rows) ? rows : []);
                      setTrackPlaysAllStationsData(null);
                  }
              });

        run.catch((e) => {
            if (!cancelled) {
                setTrackPlaysError(e);
                setTrackPlaysData(null);
                setTrackPlaysAllStationsData(null);
            }
        }).finally(() => {
            if (!cancelled) {
                setTrackPlaysLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [activeSpotifyTrackId, days, station, isChartMode]);

    // --- Play-log mode: load playlist ---
    const loadPlaylist = useCallback(() => {
        setLoading(true);
        setError(null);
        const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
        const l = clampInt(limit, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
        const url = getPlaylistTracksUrl({
            days: d,
            limit: l,
            station: station || undefined,
            sort,
        });
        fetchJson(url)
            .then((rows) => {
                if (!Array.isArray(rows)) {
                    setTracks([]);
                    return;
                }
                setTracks(rows);
                setPlayerSession((s) => s + 1);
            })
            .catch((e) => {
                setError(e);
                setTracks([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [days, limit, station, sort]);

    useEffect(() => {
        if (isChartMode || !runFlag) {
            return;
        }
        loadPlaylist();
    }, [isChartMode, runFlag, days, limit, station, sort, loadPlaylist]);

    // --- Chart mode: load chart tracks ---
    const loadChart = useCallback(
        (chart, week) => {
            if (!chart) return;
            setLoading(true);
            setError(null);
            fetchJson(getChartTracksUrl({ chart, week }))
                .then((body) => {
                    const rows = Array.isArray(body.tracks) ? body.tracks : [];
                    setTracks(
                        rows.map((r) => ({
                            spotify_track_id: r.spotify_track_id,
                            spotify_track_title: r.entry_title,
                            spotify_artist_title: r.entry_artist,
                            chart_position: r.chart_position,
                        })),
                    );
                    setAvailableWeeks(Array.isArray(body.available_weeks) ? body.available_weeks : []);
                    setCurrentWeek(body.chart_year_week ?? null);
                    setPlayerSession((s) => s + 1);
                })
                .catch((e) => {
                    setError(e);
                    setTracks([]);
                    setAvailableWeeks([]);
                    setCurrentWeek(null);
                })
                .finally(() => {
                    setLoading(false);
                });
        },
        [],
    );

    useEffect(() => {
        if (!isChartMode || !chartId) return;
        loadChart(chartId, chartWeek);
    }, [isChartMode, chartId, chartWeek, loadChart]);

    // --- Fetch station + chart options on mount ---
    useEffect(() => {
        fetchJson(getStationsUrl())
            .then((body) => {
                setStationOptions(mergeStationIds([], body.logged));
                if (Array.isArray(body.charts)) {
                    setChartOptions(body.charts);
                }
            })
            .catch(() => {
                setStationOptions([]);
                setChartOptions([]);
            });
    }, []);

    // --- URL setters ---
    const patch = useCallback(
        (p) => setSearchParams(patchPlaylistState(searchParams, p), { replace: true }),
        [searchParams, setSearchParams],
    );

    const onActiveIndexChange = useCallback(
        (index) => {
            patch({ idx: index });
        },
        [patch],
    );

    const seekToPlaylistIndex = useCallback(
        (index) => {
            setShuffleHistory([]);
            patch({ idx: index });
        },
        [patch],
    );

    const handleNavigateNext = useCallback(() => {
        const n = uris.length;
        if (n <= 1) return;
        if (playType === PLAY_TYPE_SHUFFLE) {
            setShuffleHistory((h) => [...h, activeIndex]);
            patch({ idx: randomIndexExcept(n, activeIndex) });
        } else {
            if (activeIndex >= n - 1) return;
            patch({ idx: activeIndex + 1 });
        }
    }, [playType, activeIndex, uris.length, patch]);

    const handleNavigatePrevious = useCallback(() => {
        const n = uris.length;
        if (n === 0) return;
        if (playType === PLAY_TYPE_SHUFFLE) {
            setShuffleHistory((h) => {
                if (h.length === 0) return h;
                const next = [...h];
                const prevIdx = next.pop();
                patch({ idx: prevIdx });
                return next;
            });
        } else {
            if (activeIndex <= 0) return;
            patch({ idx: activeIndex - 1 });
        }
    }, [playType, activeIndex, patch]);

    const canNavigateNext =
        uris.length > 0 && (playType === PLAY_TYPE_SHUFFLE ? uris.length > 1 : activeIndex < uris.length - 1);

    const canNavigatePrevious =
        playType === PLAY_TYPE_SHUFFLE ? shuffleHistory.length > 0 : activeIndex > 0;

    const setPlayTypeParam = useCallback(
        (next) => {
            setShuffleHistory([]);
            patch({ playType: next });
        },
        [patch],
    );

    useEffect(() => {
        setShuffleHistory([]);
    }, [playerSession]);

    /** Fix shared links where idx is past the end of the loaded list. */
    useEffect(() => {
        if (tracks.length === 0 || urlPlaylistIndex == null) {
            return;
        }
        const max = tracks.length - 1;
        if (urlPlaylistIndex > max) {
            patch({ idx: max });
        }
    }, [tracks.length, urlPlaylistIndex, patch]);

    const setMode = useCallback(
        (m) => {
            setTracks([]);
            setError(null);
            setAvailableWeeks([]);
            setCurrentWeek(null);
            patch({ mode: m });
        },
        [patch],
    );

    const setDays = useCallback((n) => patch({ days: clampInt(n, DEFAULT_STATS_DAYS, MAX_STATS_DAYS) }), [patch]);
    const setLimit = useCallback((n) => patch({ limit: clampInt(n, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT) }), [patch]);
    const setStation = useCallback((s) => patch({ station: s }), [patch]);
    const setSort = useCallback(
        (s) => patch({ sort: s === PLAYLIST_SORT_RECENT ? PLAYLIST_SORT_RECENT : PLAYLIST_SORT_PLAY_COUNT }),
        [patch],
    );
    const setChartIdParam = useCallback((c) => patch({ chart: c, week: null }), [patch]);
    const setChartWeekParam = useCallback((w) => patch({ week: w }), [patch]);
    const setDeviceParam = useCallback((d) => patch({ device: d || null }), [patch]);

    const handleGenerate = useCallback(() => {
        if (runFlag) {
            loadPlaylist();
        } else {
            patch({ run: true });
        }
    }, [runFlag, loadPlaylist, patch]);

    // --- Week stepper helpers ---
    const weekIndex = availableWeeks.indexOf(currentWeek);
    const canPrevWeek = weekIndex >= 0 && weekIndex < availableWeeks.length - 1;
    const canNextWeek = weekIndex > 0;

    const handlePrevWeek = useCallback(() => {
        if (!canPrevWeek) return;
        setChartWeekParam(availableWeeks[weekIndex + 1]);
    }, [canPrevWeek, availableWeeks, weekIndex, setChartWeekParam]);

    const handleNextWeek = useCallback(() => {
        if (!canNextWeek) return;
        setChartWeekParam(availableWeeks[weekIndex - 1]);
    }, [canNextWeek, availableWeeks, weekIndex, setChartWeekParam]);

    const handleLatestWeek = useCallback(() => {
        setChartWeekParam(null);
    }, [setChartWeekParam]);

    // --- Sidebar station label for plays-over-time ---
    const playsLabel = isChartMode
        ? 'All stations'
        : station
          ? `Station: ${station}`
          : 'All stations';

    return (
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
            <div style={panelStyle}>
                {/* Mode toggle */}
                <div style={toggleWrapStyle}>
                    <button
                        type="button"
                        style={toggleBtnStyle(!isChartMode)}
                        onClick={() => setMode(PLAYLIST_MODE_PLAYLOG)}
                    >
                        Play Log
                    </button>
                    <button
                        type="button"
                        style={toggleBtnStyle(isChartMode)}
                        onClick={() => setMode(PLAYLIST_MODE_CHART)}
                    >
                        Charts
                    </button>
                </div>

                {/* Play-log controls */}
                {!isChartMode && (
                    <>
                        <div style={fieldStyle}>
                            <label htmlFor="gp-days" style={labelStyle}>
                                Days window
                            </label>
                            <input
                                id="gp-days"
                                type="number"
                                min={1}
                                max={MAX_STATS_DAYS}
                                value={days}
                                onChange={(e) => setDays(Number(e.target.value))}
                                style={inputStyle}
                            />
                        </div>
                        <div style={fieldStyle}>
                            <label htmlFor="gp-limit" style={labelStyle}>
                                Limit (tracks)
                            </label>
                            <input
                                id="gp-limit"
                                type="number"
                                min={1}
                                max={MAX_STATS_LIMIT}
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                                style={inputStyle}
                            />
                        </div>
                        <div style={fieldStyle}>
                            <label htmlFor="gp-station" style={labelStyle}>
                                Station
                            </label>
                            <select
                                id="gp-station"
                                value={station}
                                onChange={(e) => setStation(e.target.value)}
                                style={{ ...inputStyle, minWidth: '100%' }}
                            >
                                <option value="">All stations</option>
                                {stationOptions.map((id) => (
                                    <option key={id} value={id}>
                                        {id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div style={fieldStyle}>
                            <label htmlFor="gp-sort" style={labelStyle}>
                                Sort by
                            </label>
                            <select
                                id="gp-sort"
                                value={sort}
                                onChange={(e) => setSort(e.target.value)}
                                style={{ ...inputStyle, minWidth: '100%' }}
                            >
                                <option value={PLAYLIST_SORT_PLAY_COUNT}>Play count</option>
                                <option value={PLAYLIST_SORT_RECENT}>Recently played</option>
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={loading}
                            style={{
                                padding: '0.55rem 0.85rem',
                                borderRadius: '6px',
                                border: '1px solid #0284c7',
                                background: loading ? '#94a3b8' : '#0284c7',
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            {loading ? 'Loading\u2026' : 'Generate'}
                        </button>
                    </>
                )}

                {/* Chart controls */}
                {isChartMode && (
                    <>
                        <div style={fieldStyle}>
                            <label htmlFor="gp-chart" style={labelStyle}>
                                Chart
                            </label>
                            <select
                                id="gp-chart"
                                value={chartId}
                                onChange={(e) => setChartIdParam(e.target.value)}
                                style={{ ...inputStyle, minWidth: '100%' }}
                            >
                                <option value="">Select a chart</option>
                                {chartOptions.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {currentWeek && (
                            <div style={fieldStyle}>
                                <span style={labelStyle}>Week</span>
                                <div style={weekStepperStyle}>
                                    <button
                                        type="button"
                                        disabled={!canPrevWeek}
                                        onClick={handlePrevWeek}
                                        style={weekBtnStyle(!canPrevWeek)}
                                        aria-label="Previous week"
                                    >
                                        &lsaquo;
                                    </button>
                                    <span
                                        style={{
                                            flex: 1,
                                            textAlign: 'center',
                                            fontSize: '0.88rem',
                                            fontWeight: 500,
                                            color: '#0f172a',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {formatYearWeek(currentWeek)}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={!canNextWeek}
                                        onClick={handleNextWeek}
                                        style={weekBtnStyle(!canNextWeek)}
                                        aria-label="Next week"
                                    >
                                        &rsaquo;
                                    </button>
                                </div>
                                {weekIndex > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleLatestWeek}
                                        style={{
                                            marginTop: '0.15rem',
                                            padding: '0.25rem 0.5rem',
                                            border: 'none',
                                            background: 'transparent',
                                            color: '#0284c7',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                            textAlign: 'center',
                                        }}
                                    >
                                        Jump to latest
                                    </button>
                                )}
                            </div>
                        )}

                        {loading && (
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Loading chart&hellip;</p>
                        )}
                    </>
                )}

                <div style={{ marginTop: '0.25rem' }}>
                    <div style={{
                        display: 'flex',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid #cbd5e1',
                        marginBottom: '0.6rem',
                    }}>
                        <button
                            type="button"
                            style={{
                                flex: 1,
                                padding: '0.35rem 0.5rem',
                                border: 'none',
                                background: playerType === 'embed' ? '#0284c7' : '#f1f5f9',
                                color: playerType === 'embed' ? '#fff' : '#475569',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'background 0.15s, color 0.15s',
                            }}
                            onClick={() => handlePlayerTypeChange('embed')}
                        >
                            Embed
                        </button>
                        <button
                            type="button"
                            style={{
                                flex: 1,
                                padding: '0.35rem 0.5rem',
                                border: 'none',
                                background: playerType === 'connect' ? '#1DB954' : '#f1f5f9',
                                color: playerType === 'connect' ? '#fff' : '#475569',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'background 0.15s, color 0.15s',
                            }}
                            onClick={() => handlePlayerTypeChange('connect')}
                        >
                            Connect
                        </button>
                    </div>
                    {playerType === 'connect' ? (
                        <SpotifyConnectPlayer
                            key={playerSession}
                            uris={uris}
                            activeIndex={activeIndex}
                            onActiveIndexChange={onActiveIndexChange}
                            playType={playType}
                            onPlayTypeChange={setPlayTypeParam}
                            onNavigateNext={handleNavigateNext}
                            onNavigatePrevious={handleNavigatePrevious}
                            canNavigateNext={canNavigateNext}
                            canNavigatePrevious={canNavigatePrevious}
                            urlDeviceName={deviceParam}
                            onDeviceNameChange={setDeviceParam}
                        />
                    ) : (
                        <SpotifyEmbedPlayer
                            key={playerSession}
                            uris={uris}
                            activeIndex={activeIndex}
                            onActiveIndexChange={onActiveIndexChange}
                            playType={playType}
                            onPlayTypeChange={setPlayTypeParam}
                            onNavigateNext={handleNavigateNext}
                            onNavigatePrevious={handleNavigatePrevious}
                            canNavigateNext={canNavigateNext}
                            canNavigatePrevious={canNavigatePrevious}
                        />
                    )}
                </div>

                <div ref={chartWrapRef} style={{ marginTop: '0.75rem' }}>
                    <p
                        style={{
                            margin: '0 0 0.35rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: '#475569',
                            letterSpacing: '0.02em',
                        }}
                    >
                        Plays over time
                    </p>
                    <p style={{ margin: '0 0 0.4rem', fontSize: '0.7rem', color: '#94a3b8' }}>
                        {playsLabel} &middot; {days} day{days === 1 ? '' : 's'} &middot; daily buckets
                    </p>
                    {!activeSpotifyTrackId && tracks.length === 0 && (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                            {isChartMode
                                ? 'Select a chart to view tracks.'
                                : 'Generate a playlist to chart the current track.'}
                        </p>
                    )}
                    {activeSpotifyTrackId && (
                        <PlaysBucketChart
                            data={trackPlaysData}
                            compareData={!isChartMode && station ? trackPlaysAllStationsData : undefined}
                            primarySeriesLabel={!isChartMode && station ? station : 'All stations'}
                            compareSeriesLabel="All stations"
                            width={chartWidth}
                            loading={trackPlaysLoading}
                            error={trackPlaysError}
                            resolutionMinutes={DEFAULT_BUCKET_MINUTES}
                            chartTitle=""
                            compact
                        />
                    )}
                </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#0f172a' }}>
                    {isChartMode && currentWeek
                        ? `Chart \u2014 ${formatYearWeek(currentWeek)}`
                        : 'Tracks'}
                </h2>
                {error && (
                    <p style={{ color: '#dc2626', fontSize: '0.9rem' }} role="alert">
                        {String(error.message || error)}
                    </p>
                )}
                {!loading && tracks.length === 0 && !error && (
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                        {isChartMode
                            ? 'Select a chart from the sidebar to load tracks.'
                            : 'Set options and click Generate to load tracks from your play log.'}
                    </p>
                )}
                <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {tracks.map((row, i) => {
                        const title = String(row.spotify_track_title ?? row.entry_title ?? '');
                        const artist = String(row.spotify_artist_title ?? row.entry_artist ?? '');
                        const plays =
                            row.play_count != null ? ` \u00b7 ${Number(row.play_count)} plays` : '';
                        const last =
                            row.last_played_at != null
                                ? ` \u00b7 last ${String(row.last_played_at).slice(0, 19)}`
                                : '';
                        return (
                            <li
                                key={`${row.spotify_track_id}-${i}`}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.35rem 0',
                                    minWidth: 0,
                                    cursor: 'pointer',
                                    fontWeight: i === activeIndex ? 700 : 400,
                                    color: i === activeIndex ? '#0369a1' : '#0f172a',
                                }}
                            >
                                <span
                                    aria-hidden
                                    style={{
                                        flexShrink: 0,
                                        minWidth: '1.75rem',
                                        textAlign: 'right',
                                        fontVariantNumeric: 'tabular-nums',
                                        color: '#94a3b8',
                                        fontSize: '0.85rem',
                                    }}
                                >
                                    {i + 1}.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => seekToPlaylistIndex(i)}
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        boxSizing: 'border-box',
                                        margin: 0,
                                        padding: 0,
                                        border: 'none',
                                        background: 'transparent',
                                        font: 'inherit',
                                        color: 'inherit',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {title} — {artist}
                                    <span style={{ color: '#64748b', fontWeight: 400 }}>
                                        {plays}
                                        {last}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
}
