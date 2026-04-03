import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PlaysBucketChart from './PlaysBucketChart.jsx';
import SpotifyEmbedPlayer from './SpotifyEmbedPlayer.jsx';
import {
    parseDays,
    parseLimit,
    parsePlaylistRun,
    parsePlaylistSort,
    parseStation,
    patchPlaylistState,
} from '../lib/appSearchParams.js';
import {
    clampBucketMinutes,
    clampInt,
    DEFAULT_BUCKET_MINUTES,
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    fetchJson,
    getPlaysByBucketTrackUrl,
    getPlaylistTracksUrl,
    getStationsUrl,
    MAX_STATS_DAYS,
    MAX_STATS_LIMIT,
    mergeStationIds,
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

    const days = useMemo(() => parseDays(searchParams), [searchParams]);
    const limit = useMemo(() => parseLimit(searchParams), [searchParams]);
    const station = useMemo(() => parseStation(searchParams), [searchParams]);
    const sort = useMemo(() => parsePlaylistSort(searchParams), [searchParams]);
    const runFlag = useMemo(() => parsePlaylistRun(searchParams), [searchParams]);

    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [playerSession, setPlayerSession] = useState(0);

    const [trackPlaysData, setTrackPlaysData] = useState(null);
    /** Plays across all stations (same buckets); only set when a station filter is active. */
    const [trackPlaysAllStationsData, setTrackPlaysAllStationsData] = useState(null);
    const [trackPlaysLoading, setTrackPlaysLoading] = useState(false);
    const [trackPlaysError, setTrackPlaysError] = useState(null);
    const [chartWrapRef, chartWidth] = useSidebarChartWidth();

    const uris = useMemo(
        () =>
            tracks
                .map((row) => row.spotify_track_id)
                .filter((id) => typeof id === 'string' && id.trim()),
        [tracks],
    );

    const onActiveIndexChange = useCallback((index) => {
        setActiveIndex(index);
    }, []);

    const activeSpotifyTrackId = useMemo(() => {
        const row = tracks[activeIndex];
        const id = row?.spotify_track_id;
        return typeof id === 'string' && id.trim() ? id.trim() : '';
    }, [tracks, activeIndex]);

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
        const stationUrl = getPlaysByBucketTrackUrl({
            ...base,
            station,
        });
        const allStationsUrl = getPlaysByBucketTrackUrl(base);

        const run = station
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
    }, [activeSpotifyTrackId, days, station]);

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
                setActiveIndex(0);
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
        if (!runFlag) {
            return;
        }
        loadPlaylist();
    }, [runFlag, days, limit, station, sort, loadPlaylist]);

    useEffect(() => {
        fetchJson(getStationsUrl())
            .then((body) => {
                setStationOptions(mergeStationIds([], body.logged));
            })
            .catch(() => {
                setStationOptions([]);
            });
    }, []);

    const setDays = useCallback(
        (n) => {
            const v = clampInt(n, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
            setSearchParams(patchPlaylistState(searchParams, { days: v }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const setLimit = useCallback(
        (n) => {
            const v = clampInt(n, DEFAULT_STATS_LIMIT, MAX_STATS_LIMIT);
            setSearchParams(patchPlaylistState(searchParams, { limit: v }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const setStation = useCallback(
        (s) => {
            setSearchParams(patchPlaylistState(searchParams, { station: s }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const setSort = useCallback(
        (s) => {
            const v = s === PLAYLIST_SORT_RECENT ? PLAYLIST_SORT_RECENT : PLAYLIST_SORT_PLAY_COUNT;
            setSearchParams(patchPlaylistState(searchParams, { sort: v }), { replace: true });
        },
        [searchParams, setSearchParams],
    );

    const handleGenerate = useCallback(() => {
        if (runFlag) {
            loadPlaylist();
        } else {
            setSearchParams(patchPlaylistState(searchParams, { run: true }), { replace: true });
        }
    }, [runFlag, loadPlaylist, searchParams, setSearchParams]);

    return (
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch' }}>
            <div style={panelStyle}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Generate Playlist</h2>

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
                    {loading ? 'Loading…' : 'Generate'}
                </button>

                <div style={{ marginTop: '0.25rem' }}>
                    <SpotifyEmbedPlayer
                        key={playerSession}
                        uris={uris}
                        activeIndex={activeIndex}
                        onActiveIndexChange={onActiveIndexChange}
                    />
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
                        {station ? `Station: ${station}` : 'All stations'} · {days} day
                        {days === 1 ? '' : 's'} · daily buckets
                    </p>
                    {!activeSpotifyTrackId && tracks.length === 0 && (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                            Generate a playlist to chart the current track.
                        </p>
                    )}
                    {activeSpotifyTrackId && (
                        <PlaysBucketChart
                            data={trackPlaysData}
                            compareData={station ? trackPlaysAllStationsData : undefined}
                            primarySeriesLabel={station ? station : 'This station'}
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
                <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#0f172a' }}>Tracks</h2>
                {error && (
                    <p style={{ color: '#dc2626', fontSize: '0.9rem' }} role="alert">
                        {String(error.message || error)}
                    </p>
                )}
                {!loading && tracks.length === 0 && !error && (
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                        Set options and click Generate to load tracks from your play log.
                    </p>
                )}
                <ol style={{ margin: 0, paddingLeft: 0, listStylePosition: 'inside' }}>
                    {tracks.map((row, i) => {
                        const title = String(row.spotify_track_title ?? '');
                        const artist = String(row.spotify_artist_title ?? '');
                        const plays =
                            row.play_count != null ? ` · ${Number(row.play_count)} plays` : '';
                        const last =
                            row.last_played_at != null
                                ? ` · last ${String(row.last_played_at).slice(0, 19)}`
                                : '';
                        return (
                            <li
                                key={`${row.spotify_track_id}-${i}`}
                                style={{
                                    padding: '0.35rem 0',
                                    cursor: 'pointer',
                                    fontWeight: i === activeIndex ? 700 : 400,
                                    color: i === activeIndex ? '#0369a1' : '#0f172a',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setActiveIndex(i)}
                                    style={{
                                        all: 'unset',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        width: '100%',
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
