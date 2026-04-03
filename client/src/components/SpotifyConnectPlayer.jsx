import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    isPlayerAuthenticated,
    getPlayerLoginUrl,
    clearPlayerAuth,
    spotifyFetch,
} from '../lib/spotifyPlayerAuth.js';

const SPOTIFY_API = 'https://api.spotify.com/v1/me/player';
const POLL_INTERVAL_MS = 1500;
const LS_DEVICE_ID = 'sp_player_device_id';

function toTrackUri(idOrUri) {
    const s = String(idOrUri ?? '').trim();
    if (!s) return '';
    if (s.startsWith('spotify:')) return s;
    return `spotify:track:${s}`;
}

function formatMs(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

const controlBarStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    marginTop: '0.75rem',
};

const controlButtonStyle = {
    padding: '0.5rem 0.85rem',
    minWidth: '2.5rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#0f172a',
    fontSize: '1.15rem',
    lineHeight: 1,
    fontFamily: 'inherit',
    cursor: 'pointer',
};

const selectStyle = {
    padding: '0.4rem 0.5rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.82rem',
    fontFamily: 'inherit',
    width: '100%',
    background: '#fff',
};

const progressBarBg = {
    width: '100%',
    height: '6px',
    background: '#e2e8f0',
    borderRadius: '3px',
    marginTop: '0.6rem',
    overflow: 'hidden',
    padding: '4px 0',
    backgroundClip: 'content-box',
    boxSizing: 'content-box',
};

export default function SpotifyConnectPlayer({ uris, activeIndex, onActiveIndexChange }) {
    const [devices, setDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState(
        () => localStorage.getItem(LS_DEVICE_ID) || '',
    );
    const [isPaused, setIsPaused] = useState(true);
    const [progressMs, setProgressMs] = useState(0);
    const [durationMs, setDurationMs] = useState(0);
    const [trackName, setTrackName] = useState('');
    const [artistName, setArtistName] = useState('');
    const [albumArt, setAlbumArt] = useState('');
    const [error, setError] = useState(null);
    const [devicesLoading, setDevicesLoading] = useState(false);
    const [volume, setVolume] = useState(50);
    const volumeTimerRef = useRef(null);

    const activeIndexRef = useRef(activeIndex);
    const urisRef = useRef(uris);
    const trackEndFiredRef = useRef(false);
    const lastPlayedUriRef = useRef('');
    activeIndexRef.current = activeIndex;
    urisRef.current = uris;

    const normalized = useMemo(
        () => uris.map(toTrackUri).filter(Boolean),
        [uris],
    );

    const currentUri = normalized[activeIndex] || '';

    const authenticated = isPlayerAuthenticated();

    // --- Fetch devices ---
    const loadDevices = useCallback(async () => {
        setDevicesLoading(true);
        try {
            const res = await spotifyFetch(`${SPOTIFY_API}/devices`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list = data.devices || [];
            setDevices(list);
            setError(null);

            const savedId = localStorage.getItem(LS_DEVICE_ID);
            if (savedId && list.some((d) => d.id === savedId)) {
                setSelectedDeviceId(savedId);
            } else if (list.length > 0) {
                const active = list.find((d) => d.is_active) || list[0];
                setSelectedDeviceId(active.id);
                localStorage.setItem(LS_DEVICE_ID, active.id);
            }
        } catch (err) {
            if (err.message === 'not_authenticated' || err.message === 'token_refresh_failed') {
                setError('auth_expired');
            } else {
                setError('devices_failed');
            }
        } finally {
            setDevicesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authenticated) return;
        loadDevices();
    }, [authenticated, loadDevices]);

    const handleDeviceChange = useCallback((e) => {
        const id = e.target.value;
        setSelectedDeviceId(id);
        localStorage.setItem(LS_DEVICE_ID, id);
    }, []);

    // --- Play a specific URI on the selected device ---
    const playUri = useCallback(
        async (uri) => {
            if (!uri || !selectedDeviceId) return;
            try {
                const res = await spotifyFetch(`${SPOTIFY_API}/play?device_id=${selectedDeviceId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uris: [uri] }),
                });
                if (res.status === 404) {
                    setError('device_not_found');
                    return;
                }
                if (!res.ok && res.status !== 204) {
                    throw new Error(`HTTP ${res.status}`);
                }
                lastPlayedUriRef.current = uri;
                trackEndFiredRef.current = false;
                setIsPaused(false);
                setError(null);
            } catch (err) {
                if (err.message === 'not_authenticated' || err.message === 'token_refresh_failed') {
                    setError('auth_expired');
                } else {
                    setError('play_failed');
                }
            }
        },
        [selectedDeviceId],
    );

    // --- Trigger play when activeIndex or uris change ---
    useEffect(() => {
        if (!authenticated || !currentUri || !selectedDeviceId) return;
        if (currentUri === lastPlayedUriRef.current) return;
        playUri(currentUri);
    }, [authenticated, currentUri, selectedDeviceId, playUri]);

    // --- Pause / Resume ---
    const handleTogglePlay = useCallback(async () => {
        try {
            if (isPaused) {
                const res = await spotifyFetch(`${SPOTIFY_API}/play?device_id=${selectedDeviceId}`, {
                    method: 'PUT',
                });
                if (res.ok || res.status === 204) setIsPaused(false);
            } else {
                const res = await spotifyFetch(`${SPOTIFY_API}/pause?device_id=${selectedDeviceId}`, {
                    method: 'PUT',
                });
                if (res.ok || res.status === 204) setIsPaused(true);
            }
        } catch {
            /* ignore transient errors */
        }
    }, [isPaused, selectedDeviceId]);

    // --- Seek ---
    const handleSeek = useCallback(
        async (e) => {
            if (durationMs <= 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const positionMs = Math.round(pct * durationMs);
            setProgressMs(positionMs);
            try {
                await spotifyFetch(
                    `${SPOTIFY_API}/seek?position_ms=${positionMs}&device_id=${selectedDeviceId}`,
                    { method: 'PUT' },
                );
            } catch {
                /* ignore transient errors */
            }
        },
        [durationMs, selectedDeviceId],
    );

    // --- Volume ---
    const handleVolumeChange = useCallback(
        (e) => {
            const val = Number(e.target.value);
            setVolume(val);
            if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
            volumeTimerRef.current = setTimeout(async () => {
                try {
                    await spotifyFetch(
                        `${SPOTIFY_API}/volume?volume_percent=${val}&device_id=${selectedDeviceId}`,
                        { method: 'PUT' },
                    );
                } catch {
                    /* ignore transient errors */
                }
            }, 200);
        },
        [selectedDeviceId],
    );

    // --- Prev / Next ---
    const handlePrevious = useCallback(() => {
        if (activeIndex <= 0) return;
        onActiveIndexChange(activeIndex - 1);
    }, [activeIndex, onActiveIndexChange]);

    const handleNext = useCallback(() => {
        if (activeIndex >= uris.length - 1) return;
        onActiveIndexChange(activeIndex + 1);
    }, [activeIndex, onActiveIndexChange, uris.length]);

    // --- Poll playback state ---
    useEffect(() => {
        if (!authenticated || normalized.length === 0) return undefined;

        let cancelled = false;

        const poll = async () => {
            try {
                const res = await spotifyFetch(SPOTIFY_API);
                if (res.status === 204 || !res.ok) return;
                const data = await res.json();

                if (cancelled) return;

                setIsPaused(!data.is_playing);
                setProgressMs(data.progress_ms ?? 0);
                setDurationMs(data.item?.duration_ms ?? 0);
                setTrackName(data.item?.name ?? '');
                setArtistName(
                    (data.item?.artists ?? []).map((a) => a.name).join(', '),
                );
                const images = data.item?.album?.images ?? [];
                setAlbumArt(images.length > 0 ? images[images.length - 1].url : '');
                if (data.device?.volume_percent != null) {
                    setVolume(data.device.volume_percent);
                }

                // Auto-advance near track end
                const pos = data.progress_ms ?? 0;
                const dur = data.item?.duration_ms ?? 0;
                if (dur > 0 && !data.is_playing && pos >= dur - 1500 && !trackEndFiredRef.current) {
                    trackEndFiredRef.current = true;
                    const idx = activeIndexRef.current;
                    const list = urisRef.current.map(toTrackUri).filter(Boolean);
                    if (idx + 1 < list.length) {
                        onActiveIndexChange(idx + 1);
                    }
                }
            } catch {
                /* ignore polling errors */
            }
        };

        poll();
        const id = setInterval(poll, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [authenticated, normalized.length, onActiveIndexChange]);

    // --- Not authenticated ---
    if (!authenticated) {
        return (
            <div
                style={{
                    borderRadius: '8px',
                    border: '1px dashed #cbd5e1',
                    padding: '1rem',
                    textAlign: 'center',
                }}
            >
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#64748b' }}>
                    Connect your Spotify account for full playback on your devices.
                </p>
                <a
                    href={getPlayerLoginUrl()}
                    style={{
                        display: 'inline-block',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        background: '#1DB954',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        textDecoration: 'none',
                        fontFamily: 'inherit',
                    }}
                >
                    Connect to Spotify
                </a>
            </div>
        );
    }

    // --- No tracks ---
    if (uris.length === 0) {
        return (
            <div
                style={{
                    borderRadius: '8px',
                    border: '1px dashed #cbd5e1',
                    padding: '1rem',
                    fontSize: '0.85rem',
                    color: '#64748b',
                    textAlign: 'center',
                }}
            >
                Generate a playlist to play tracks here.
            </div>
        );
    }

    const canGoPrev = activeIndex > 0;
    const canGoNext = activeIndex < uris.length - 1;
    const progressPct = durationMs > 0 ? (progressMs / durationMs) * 100 : 0;

    return (
        <div style={{ width: '100%' }}>
            {/* Device picker */}
            <div style={{ marginBottom: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <select
                        value={selectedDeviceId}
                        onChange={handleDeviceChange}
                        style={selectStyle}
                        aria-label="Playback device"
                    >
                        {devices.length === 0 && (
                            <option value="">No devices found</option>
                        )}
                        {devices.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name} ({d.type})
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={loadDevices}
                        disabled={devicesLoading}
                        style={{
                            ...controlButtonStyle,
                            fontSize: '0.85rem',
                            padding: '0.4rem 0.6rem',
                            minWidth: 'auto',
                            flexShrink: 0,
                        }}
                        aria-label="Refresh devices"
                        title="Refresh devices"
                    >
                        {devicesLoading ? '\u2026' : '\u21BB'}
                    </button>
                </div>
            </div>

            {/* Now playing info */}
            {trackName && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        marginBottom: '0.4rem',
                    }}
                >
                    {albumArt && (
                        <img
                            src={albumArt}
                            alt=""
                            width={40}
                            height={40}
                            style={{ borderRadius: '4px', flexShrink: 0 }}
                        />
                    )}
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div
                            style={{
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {trackName}
                        </div>
                        <div
                            style={{
                                fontSize: '0.75rem',
                                color: '#64748b',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {artistName}
                        </div>
                    </div>
                </div>
            )}

            {/* Progress bar (clickable to seek) */}
            <div
                role="slider"
                tabIndex={0}
                aria-label="Track progress"
                aria-valuenow={Math.round(progressMs / 1000)}
                aria-valuemin={0}
                aria-valuemax={Math.round(durationMs / 1000)}
                style={{ ...progressBarBg, cursor: durationMs > 0 ? 'pointer' : 'default' }}
                onClick={handleSeek}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: '#1DB954',
                        borderRadius: '2px',
                        transition: 'width 0.3s linear',
                        pointerEvents: 'none',
                    }}
                />
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.7rem',
                    color: '#94a3b8',
                    marginTop: '0.2rem',
                }}
            >
                <span>{formatMs(progressMs)}</span>
                <span>{formatMs(durationMs)}</span>
            </div>

            {/* Controls */}
            <div style={controlBarStyle}>
                <button
                    type="button"
                    style={{
                        ...controlButtonStyle,
                        opacity: canGoPrev ? 1 : 0.45,
                        cursor: canGoPrev ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!canGoPrev}
                    onClick={handlePrevious}
                    aria-label="Previous track"
                >
                    <span aria-hidden="true">⏮</span>
                </button>
                <button
                    type="button"
                    style={controlButtonStyle}
                    onClick={handleTogglePlay}
                    aria-label={isPaused ? 'Play' : 'Pause'}
                >
                    <span aria-hidden="true">{isPaused ? '▶' : '⏸'}</span>
                </button>
                <button
                    type="button"
                    style={{
                        ...controlButtonStyle,
                        opacity: canGoNext ? 1 : 0.45,
                        cursor: canGoNext ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!canGoNext}
                    onClick={handleNext}
                    aria-label="Next track"
                >
                    <span aria-hidden="true">⏭</span>
                </button>
            </div>

            {/* Volume */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginTop: '0.6rem',
                    fontSize: '0.78rem',
                    color: '#64748b',
                }}
            >
                <span aria-hidden="true" style={{ flexShrink: 0 }}>🔈</span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={handleVolumeChange}
                    aria-label="Volume"
                    style={{ flex: 1, cursor: 'pointer', accentColor: '#1DB954' }}
                />
                <span
                    style={{
                        minWidth: '2rem',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: '0.72rem',
                    }}
                >
                    {volume}%
                </span>
            </div>

            {/* Error / status messages */}
            {error === 'auth_expired' && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#dc2626', textAlign: 'center' }}>
                    Session expired.{' '}
                    <a
                        href={getPlayerLoginUrl()}
                        style={{ color: '#0284c7', fontWeight: 600 }}
                        onClick={() => clearPlayerAuth()}
                    >
                        Re-connect
                    </a>
                </p>
            )}
            {error === 'device_not_found' && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#ea580c', textAlign: 'center' }}>
                    Device not available. Open Spotify on your device and refresh.
                </p>
            )}
            {error === 'devices_failed' && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#ea580c', textAlign: 'center' }}>
                    Could not load devices. Try refreshing.
                </p>
            )}
            {error === 'play_failed' && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#ea580c', textAlign: 'center' }}>
                    Playback failed. Make sure Spotify is active on the selected device.
                </p>
            )}

            {/* Disconnect link */}
            <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                <button
                    type="button"
                    onClick={() => {
                        clearPlayerAuth();
                        window.location.reload();
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textDecoration: 'underline',
                    }}
                >
                    Disconnect Spotify
                </button>
            </div>
        </div>
    );
}
