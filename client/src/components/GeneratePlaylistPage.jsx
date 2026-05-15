import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PlaysBucketChart from './PlaysBucketChart.jsx';
import TrackAudioFeaturesRadar from './TrackAudioFeaturesRadar.jsx';
import SpotifyEmbedPlayer from './SpotifyEmbedPlayer.jsx';
import SpotifyConnectPlayer from './SpotifyConnectPlayer.jsx';
import { consumeHashTokens } from '../lib/spotifyPlayerAuth.js';
import {
    parseChartId,
    parseChartWeek,
    parseDays,
    parseDevice,
    parseLimit,
    parsePlaylistGenre,
    parsePlaylistMood,
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
    getTrackAudioFeaturesUrl,
    getStationsUrl,
    getPlaylistMoodsUrl,
    getTrackGenresUrl,
    MAX_STATS_DAYS,
    MAX_STATS_LIMIT,
    mergeStationIds,
    PLAYLIST_MODE_CHART,
    PLAYLIST_MODE_PLAYLOG,
    PLAYLIST_SORT_PLAY_COUNT,
    PLAYLIST_SORT_RECENT,
} from '../lib/statsApi.js';
import { parsePlaylistDecades, PLAYLIST_DECADE_OPTIONS } from '../lib/releaseDecades.js';
import { trackDisplayLabel } from '../lib/trackLabel.js';

/** Plays-over-time chart always uses this window; not tied to ?days (playlist controls). */
const PLAYLIST_TRACK_PLAYS_DAYS = 90;

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
 * Returns a Fisher-Yates shuffled array of indices [0..n-1].
 * @param {number} n
 * @returns {number[]}
 */
function shuffleIndices(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
    const [genreOptions, setGenreOptions] = useState([]);
    /** @type {Array<{ id: string, label: string }>} */
    const [moodOptions, setMoodOptions] = useState([]);

    const mode = useMemo(() => parsePlaylistMode(searchParams), [searchParams]);
    const isChartMode = mode === PLAYLIST_MODE_CHART;

    const days = useMemo(() => parseDays(searchParams), [searchParams]);
    const limit = useMemo(() => parseLimit(searchParams), [searchParams]);
    const station = useMemo(() => parseStation(searchParams), [searchParams]);
    const genre = useMemo(() => parsePlaylistGenre(searchParams), [searchParams]);
    const mood = useMemo(() => parsePlaylistMood(searchParams), [searchParams]);
    const decades = useMemo(() => parsePlaylistDecades(searchParams), [searchParams]);
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
    /**
     * When shuffle is active, holds a permutation of track indices that defines
     * the shuffled order shown in the view and loaded into the Spotify queue.
     * null = original order (regular mode).
     */
    const [shuffledOrder, setShuffledOrder] = useState(null);

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
    const [trackAudioFeatures, setTrackAudioFeatures] = useState(null);
    const [trackAudioFeaturesLoading, setTrackAudioFeaturesLoading] = useState(false);
    const [trackAudioFeaturesError, setTrackAudioFeaturesError] = useState(null);
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

    /** Tracks in display/queue order — shuffled when shuffle is active, original otherwise. */
    const displayedTracks = useMemo(
        () => (shuffledOrder ? shuffledOrder.map((i) => tracks[i]).filter(Boolean) : tracks),
        [tracks, shuffledOrder],
    );

    const uris = useMemo(
        () =>
            displayedTracks
                .map((row) => row.spotify_track_id)
                .filter((id) => typeof id === 'string' && id.trim()),
        [displayedTracks],
    );

    const activeSpotifyTrackId = useMemo(() => {
        const row = displayedTracks[activeIndex];
        const id = row?.spotify_track_id;
        return typeof id === 'string' && id.trim() ? id.trim() : '';
    }, [displayedTracks, activeIndex]);

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
        const d = clampInt(PLAYLIST_TRACK_PLAYS_DAYS, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
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
    }, [activeSpotifyTrackId, station, isChartMode]);

    // --- Audio features for active track (DB) ---
    useEffect(() => {
        if (!activeSpotifyTrackId) {
            setTrackAudioFeatures(null);
            setTrackAudioFeaturesLoading(false);
            setTrackAudioFeaturesError(null);
            return;
        }
        let cancelled = false;
        setTrackAudioFeaturesLoading(true);
        setTrackAudioFeaturesError(null);
        fetchJson(getTrackAudioFeaturesUrl(activeSpotifyTrackId))
            .then((body) => {
                if (!cancelled) {
                    setTrackAudioFeatures(
                        body && typeof body === 'object' && body.track != null
                            ? /** @type {Record<string, number>} */ (body.track)
                            : null,
                    );
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    setTrackAudioFeaturesError(e);
                    setTrackAudioFeatures(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setTrackAudioFeaturesLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [activeSpotifyTrackId]);

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
            genre: genre || undefined,
            mood: mood || undefined,
            decades: decades.length > 0 ? decades : undefined,
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
    }, [days, limit, station, sort, genre, mood, decades]);

    useEffect(() => {
        if (isChartMode || !runFlag) {
            return;
        }
        loadPlaylist();
    }, [isChartMode, runFlag, days, limit, station, sort, genre, mood, decades, loadPlaylist]);

    // --- Chart mode: load chart tracks ---
    const loadChart = useCallback(
        (chart, week) => {
            if (!chart) return;
            setLoading(true);
            setError(null);
            fetchJson(
                getChartTracksUrl({
                    chart,
                    week,
                    genre: genre || undefined,
                    mood: mood || undefined,
                    decades: decades.length > 0 ? decades : undefined,
                }),
            )
                .then((body) => {
                    const rows = Array.isArray(body.tracks) ? body.tracks : [];
                    setTracks(
                        rows.map((r) => ({
                            spotify_track_id: r.spotify_track_id,
                            spotify_track_title: r.entry_title,
                            spotify_artist_title: r.entry_artist,
                            chart_position: r.chart_position,
                            previous_position: r.previous_position ?? null,
                            position_change: r.position_change ?? null,
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
        [genre, mood, decades],
    );

    useEffect(() => {
        if (!isChartMode || !chartId) return;
        loadChart(chartId, chartWeek);
    }, [isChartMode, chartId, chartWeek, loadChart]);

    // --- Fetch station + chart options on mount ---
    useEffect(() => {
        Promise.all([
            fetchJson(getStationsUrl()),
            fetchJson(getTrackGenresUrl()),
            fetchJson(getPlaylistMoodsUrl()),
        ])
            .then(([body, genresBody, moodsBody]) => {
                setStationOptions(mergeStationIds([], body.logged));
                if (Array.isArray(body.charts)) {
                    setChartOptions(body.charts);
                }
                if (Array.isArray(genresBody.genres)) {
                    setGenreOptions(genresBody.genres);
                } else {
                    setGenreOptions([]);
                }
                if (Array.isArray(moodsBody.moods)) {
                    setMoodOptions(moodsBody.moods);
                } else {
                    setMoodOptions([]);
                }
            })
            .catch(() => {
                setStationOptions([]);
                setChartOptions([]);
                setGenreOptions([]);
                setMoodOptions([]);
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
            patch({ idx: index });
        },
        [patch],
    );

    const handleNavigateNext = useCallback(() => {
        if (activeIndex >= uris.length - 1) return;
        patch({ idx: activeIndex + 1 });
    }, [activeIndex, uris.length, patch]);

    const handleNavigatePrevious = useCallback(() => {
        if (activeIndex <= 0) return;
        patch({ idx: activeIndex - 1 });
    }, [activeIndex, patch]);

    const canNavigateNext = uris.length > 0 && activeIndex < uris.length - 1;
    const canNavigatePrevious = activeIndex > 0;

    const setPlayTypeParam = useCallback(
        (next) => {
            if (next === PLAY_TYPE_SHUFFLE) {
                const order = shuffleIndices(tracks.length);
                setShuffledOrder(order);
            } else {
                setShuffledOrder(null);
            }
            patch({ playType: next, idx: 0 });
        },
        [tracks.length, patch],
    );

    /**
     * A stable string that changes only when the playlist-determining params change
     * (not when playtype/idx/device change). Used to detect genuinely new playlists
     * and reset the shuffled order without being tricked by spurious re-fetches that
     * give tracks a new array reference even though the content is the same.
     */
    const playlistIdentity = `${mode}|${days}|${limit}|${station}|${sort}|${genre}|${mood}|${decades.join(',')}|${chartId}|${String(chartWeek)}|${runFlag ? '1' : '0'}`;

    // Clear shuffled order only when the playlist content itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        setShuffledOrder(null);
    // playlistIdentity is intentionally inlined — it's a primitive string, stable across
    // URL changes that don't affect playlist content (e.g. playtype, idx, device).
    }, [playlistIdentity]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const setGenreParam = useCallback((g) => patch({ genre: g ? g : null }), [patch]);
    const setMoodParam = useCallback((m) => patch({ mood: m ? m : null }), [patch]);
    const setDecadesParam = useCallback(
        (nextIds) => {
            patch({ decades: nextIds.length > 0 ? nextIds : null });
        },
        [patch],
    );
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

    const genreOrphan = Boolean(genre && !genreOptions.includes(genre));
    const moodIds = useMemo(() => moodOptions.map((x) => x.id), [moodOptions]);
    const moodOrphan = Boolean(mood && !moodIds.includes(mood));

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

                <div style={fieldStyle}>
                    <label htmlFor="gp-genre" style={labelStyle}>
                        Genre
                    </label>
                    <select
                        id="gp-genre"
                        value={genre}
                        onChange={(e) => setGenreParam(e.target.value)}
                        style={{ ...inputStyle, minWidth: '100%' }}
                    >
                        <option value="">All genres</option>
                        {genreOrphan ? (
                            <option value={genre}>{genre}</option>
                        ) : null}
                        {genreOptions.map((g) => (
                            <option key={g} value={g}>
                                {g}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={fieldStyle}>
                    <label htmlFor="gp-mood" style={labelStyle}>
                        Mood
                    </label>
                    <select
                        id="gp-mood"
                        value={mood}
                        onChange={(e) => setMoodParam(e.target.value)}
                        style={{ ...inputStyle, minWidth: '100%' }}
                    >
                        <option value="">All moods</option>
                        {moodOrphan ? (
                            <option value={mood}>{mood}</option>
                        ) : null}
                        {moodOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={fieldStyle}>
                    <details
                        style={{ width: '100%' }}
                    >
                        <summary
                            style={{
                                ...labelStyle,
                                cursor: 'pointer',
                                listStyle: 'none',
                            }}
                        >
                            Decade{decades.length > 0 ? ` (${decades.length})` : ''}
                        </summary>
                        <div
                            style={{
                                marginTop: 8,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                            }}
                        >
                            {PLAYLIST_DECADE_OPTIONS.map((opt) => (
                                <label
                                    key={opt.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        cursor: 'pointer',
                                        fontSize: 13,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={decades.includes(opt.id)}
                                        onChange={(e) => {
                                            const next = new Set(decades);
                                            if (e.target.checked) {
                                                next.add(opt.id);
                                            } else {
                                                next.delete(opt.id);
                                            }
                                            const ordered = PLAYLIST_DECADE_OPTIONS.map((o) => o.id).filter(
                                                (id) => next.has(id),
                                            );
                                            setDecadesParam(ordered);
                                        }}
                                    />
                                    <span>{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    </details>
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
                        {playsLabel} &middot; {PLAYLIST_TRACK_PLAYS_DAYS} days &middot; daily buckets
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

                    {activeSpotifyTrackId && (
                        <div style={{ marginTop: '0.85rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: '0.35rem',
                                }}
                            >
                                <div>
                                    <p
                                        style={{
                                            margin: '0 0 0.15rem',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            color: '#475569',
                                            letterSpacing: '0.02em',
                                        }}
                                    >
                                        Audio features
                                    </p>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>
                                        This track
                                    </p>
                                </div>
                                <span
                                    title="Spotify audio features (0–100% on each axis). Loudness uses a dB-to-percent mapping."
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '1rem',
                                        height: '1rem',
                                        borderRadius: '50%',
                                        border: '1px solid #cbd5e1',
                                        color: '#94a3b8',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        lineHeight: 1,
                                        flexShrink: 0,
                                        cursor: 'help',
                                    }}
                                >
                                    ?
                                </span>
                            </div>
                            <TrackAudioFeaturesRadar
                                data={trackAudioFeatures}
                                width={chartWidth}
                                loading={trackAudioFeaturesLoading}
                                error={trackAudioFeaturesError}
                            />
                        </div>
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
                    {displayedTracks.map((row, i) => {
                        const label = trackDisplayLabel(
                            row.spotify_artist_title ?? row.entry_artist,
                            row.spotify_track_title ?? row.entry_title,
                        );
                        const plays =
                            row.play_count != null ? ` \u00b7 ${Number(row.play_count)} plays` : '';
                        const last =
                            row.last_played_at != null
                                ? ` \u00b7 last ${String(row.last_played_at).slice(0, 19)}`
                                : '';
                        const change = row.position_change;
                        const isChartRow = row.chart_position != null;
                        let changeBadge = null;
                        if (isChartRow) {
                            if (change == null) {
                                changeBadge = (
                                    <span
                                        title="New entry"
                                        style={{
                                            flexShrink: 0,
                                            fontSize: '0.6rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.03em',
                                            color: '#7c3aed',
                                            background: '#ede9fe',
                                            borderRadius: '3px',
                                            padding: '1px 4px',
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        NEW
                                    </span>
                                );
                            } else if (change > 0) {
                                changeBadge = (
                                    <span
                                        title={`Up ${change} from #${row.previous_position}`}
                                        style={{
                                            flexShrink: 0,
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            color: '#16a34a',
                                            lineHeight: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1px',
                                        }}
                                    >
                                        ▲<span style={{ fontVariantNumeric: 'tabular-nums' }}>{change}</span>
                                    </span>
                                );
                            } else if (change < 0) {
                                changeBadge = (
                                    <span
                                        title={`Down ${Math.abs(change)} from #${row.previous_position}`}
                                        style={{
                                            flexShrink: 0,
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            color: '#dc2626',
                                            lineHeight: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1px',
                                        }}
                                    >
                                        ▼<span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.abs(change)}</span>
                                    </span>
                                );
                            } else {
                                changeBadge = (
                                    <span
                                        title="Unchanged"
                                        style={{
                                            flexShrink: 0,
                                            fontSize: '0.68rem',
                                            color: '#94a3b8',
                                            lineHeight: 1,
                                        }}
                                    >
                                        ▬
                                    </span>
                                );
                            }
                        }
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
                                {changeBadge}
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
                                    {label}
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
