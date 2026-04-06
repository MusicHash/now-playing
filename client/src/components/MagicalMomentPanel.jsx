import { useCallback, useEffect, useRef, useState } from 'react';
import {
    DEFAULT_MAGICAL_MINUTES,
    MAX_MAGICAL_MINUTES,
    fetchJson,
    getMagicalMomentUrl,
} from '../lib/statsApi.js';

/**
 * @param {{ stationOptions: string[] }} props
 */
export default function MagicalMomentPanel({ stationOptions }) {
    const [atLocal, setAtLocal] = useState('');
    const [minutes, setMinutes] = useState(DEFAULT_MAGICAL_MINUTES);
    const [station, setStation] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const atIso =
                atLocal.trim() === ''
                    ? undefined
                    : new Date(atLocal).toISOString();
            const body = await fetchJson(
                getMagicalMomentUrl({
                    minutes,
                    at: atIso,
                    station: station.trim() || undefined,
                }),
            );
            setData(body);
        } catch (e) {
            setError(e);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [atLocal, minutes, station]);

    const loadRef = useRef(load);
    loadRef.current = load;

    useEffect(() => {
        loadRef.current();
    }, []);

    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.35rem' };
    const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#475569' };
    const inputStyle = {
        padding: '0.45rem 0.6rem',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        fontSize: '0.95rem',
        minWidth: '5rem',
    };

    return (
        <section style={{ marginTop: '2.5rem' }} aria-labelledby="magical-moment-heading">
            <h3
                id="magical-moment-heading"
                style={{ fontSize: '1.05rem', margin: '0 0 0.75rem', color: '#0f172a' }}
            >
                Magical moment
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b', maxWidth: '42rem' }}>
                Plays logged in the station database for each station within the window ending at the
                chosen time (or now if left blank). Default window is {DEFAULT_MAGICAL_MINUTES}{' '}
                minutes.
            </p>
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    gap: '1rem',
                    marginBottom: '1rem',
                }}
            >
                <div style={fieldStyle}>
                    <label htmlFor="mm-at" style={labelStyle}>
                        End time (leave blank for now)
                    </label>
                    <input
                        id="mm-at"
                        type="datetime-local"
                        value={atLocal}
                        onChange={(e) => setAtLocal(e.target.value)}
                        style={{ ...inputStyle, minWidth: '12rem' }}
                    />
                </div>
                <div style={fieldStyle}>
                    <label htmlFor="mm-minutes" style={labelStyle}>
                        Window (minutes)
                    </label>
                    <input
                        id="mm-minutes"
                        type="number"
                        min={1}
                        max={MAX_MAGICAL_MINUTES}
                        value={minutes}
                        onChange={(e) => setMinutes(Number(e.target.value))}
                        style={inputStyle}
                    />
                </div>
                <div style={fieldStyle}>
                    <label htmlFor="mm-station" style={labelStyle}>
                        Station
                    </label>
                    <select
                        id="mm-station"
                        value={station}
                        onChange={(e) => setStation(e.target.value)}
                        style={{ ...inputStyle, minWidth: '10rem' }}
                    >
                        <option value="">All stations</option>
                        {stationOptions.map((id) => (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => load()}
                    style={{
                        padding: '0.5rem 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid #7dd3fc',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                    }}
                >
                    Refresh
                </button>
            </div>

            {loading && (
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>Loading…</p>
            )}
            {error && (
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#b91c1c' }}>
                    {error.message || String(error)}
                </p>
            )}

            {!loading && !error && data && (
                <>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                        Window:{' '}
                        <time dateTime={data.window_start}>
                            {new Date(data.window_start).toLocaleString()}
                        </time>
                        {' — '}
                        <time dateTime={data.window_end}>
                            {new Date(data.window_end).toLocaleString()}
                        </time>{' '}
                        ({data.window_minutes} min)
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                        <table
                            style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '0.9rem',
                            }}
                        >
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                    <th
                                        style={{
                                            padding: '0.5rem 0.75rem 0.5rem 0',
                                            color: '#334155',
                                            fontWeight: 600,
                                        }}
                                    >
                                        Station
                                    </th>
                                    <th
                                        style={{
                                            padding: '0.5rem 0',
                                            color: '#334155',
                                            fontWeight: 600,
                                        }}
                                    >
                                        Songs in window
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.stations.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={2}
                                            style={{ padding: '0.75rem 0', color: '#64748b' }}
                                        >
                                            No plays in this window.
                                        </td>
                                    </tr>
                                ) : (
                                    data.stations.map((row) => (
                                        <tr
                                            key={row.station}
                                            style={{ borderBottom: '1px solid #f1f5f9' }}
                                        >
                                            <td
                                                style={{
                                                    padding: '0.65rem 0.75rem 0.65rem 0',
                                                    verticalAlign: 'top',
                                                    color: '#0f172a',
                                                    fontWeight: 500,
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {row.station}
                                            </td>
                                            <td style={{ padding: '0.65rem 0', verticalAlign: 'top' }}>
                                                {row.plays.length === 0 ? (
                                                    <span style={{ color: '#94a3b8' }}>—</span>
                                                ) : (
                                                    <ul
                                                        style={{
                                                            margin: 0,
                                                            paddingLeft: '1.15rem',
                                                            color: '#334155',
                                                        }}
                                                    >
                                                        {row.plays.map((play, i) => {
                                                            const t = play.log_datetime_played;
                                                            const when =
                                                                t != null
                                                                    ? new Date(t).toLocaleString()
                                                                    : '';
                                                            const title =
                                                                play.spotify_track_title ||
                                                                play.log_title ||
                                                                '—';
                                                            const artist =
                                                                play.spotify_artist_title ||
                                                                play.log_artist ||
                                                                '';
                                                            const line =
                                                                artist === ''
                                                                    ? title
                                                                    : `${artist} — ${title}`;
                                                            return (
                                                                <li key={`${row.station}-${i}-${when}`} style={{ marginBottom: '0.35rem' }}>
                                                                    <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
                                                                        {when}
                                                                    </span>
                                                                    {' · '}
                                                                    {line}
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}
