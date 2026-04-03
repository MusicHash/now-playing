import { useCallback, useEffect, useMemo, useState } from 'react';
import SpotifyEmbedPlayer from './SpotifyEmbedPlayer.jsx';
import {
    clampInt,
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    fetchJson,
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

export default function GeneratePlaylistPage() {
    const [days, setDays] = useState(DEFAULT_STATS_DAYS);
    const [limit, setLimit] = useState(DEFAULT_STATS_LIMIT);
    const [station, setStation] = useState('');
    const [sort, setSort] = useState(PLAYLIST_SORT_PLAY_COUNT);
    const [stationOptions, setStationOptions] = useState([]);

    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [playerSession, setPlayerSession] = useState(0);

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

    useEffect(() => {
        fetchJson(getStationsUrl())
            .then((body) => {
                setStationOptions(mergeStationIds([], body.logged));
            })
            .catch(() => {
                setStationOptions([]);
            });
    }, []);

    const handleGenerate = useCallback(() => {
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

    return (
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', minHeight: '60vh' }}>
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
            </div>

            <div style={{ flex: 1, minWidth: 0, padding: '0 0 0 1.5rem' }}>
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
                <ol style={{ margin: 0, paddingLeft: '1.25rem', maxHeight: '70vh', overflow: 'auto' }}>
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
