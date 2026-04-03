import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpotifyIFrameAPI } from '../lib/spotifyEmbedIframe.js';

/**
 * @param {string} idOrUri
 */
function toTrackUri(idOrUri) {
    const s = String(idOrUri ?? '').trim();
    if (!s) {
        return '';
    }
    if (s.startsWith('spotify:')) {
        return s;
    }
    return `spotify:track:${s}`;
}

/**
 * @param {{
 *   uris: string[],
 *   activeIndex: number,
 *   onActiveIndexChange: (index: number) => void,
 * }} props
 */
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

export default function SpotifyEmbedPlayer({ uris, activeIndex, onActiveIndexChange }) {
    const containerRef = useRef(null);
    const controllerRef = useRef(null);
    const activeIndexRef = useRef(activeIndex);
    const urisRef = useRef(uris);
    /** URI passed to createController — only skip loadUri when still on that track */
    const embeddedUriRef = useRef('');
    const skipLoadUriAfterCreateRef = useRef(true);
    const [isPaused, setIsPaused] = useState(true);

    activeIndexRef.current = activeIndex;
    urisRef.current = uris;

    const uriKey = uris.join('|');

    useEffect(() => {
        const el = containerRef.current;
        if (!el || uris.length === 0) {
            return undefined;
        }

        const normalized = uris.map(toTrackUri).filter(Boolean);
        if (normalized.length === 0) {
            return undefined;
        }

        let cancelled = false;

        getSpotifyIFrameAPI().then((IFrameAPI) => {
            if (cancelled || !containerRef.current) {
                return;
            }
            const startIdx = Math.min(Math.max(0, activeIndexRef.current), normalized.length - 1);
            IFrameAPI.createController(
                el,
                {
                    width: '100%',
                    height: 152,
                    uri: normalized[startIdx],
                },
                (EmbedController) => {
                    if (cancelled) {
                        return;
                    }
                    controllerRef.current = EmbedController;
                    embeddedUriRef.current = normalized[startIdx];
                    skipLoadUriAfterCreateRef.current = true;

                    let trackEndFired = false;
                    EmbedController.addListener('playback_update', (e) => {
                        const { position, duration, isPaused: paused } = e.data;
                        setIsPaused(!!paused);
                        /** Spotify reports position/duration in milliseconds */
                        if (duration <= 0) {
                            return;
                        }
                        if (!trackEndFired && position >= duration - 500) {
                            trackEndFired = true;
                            const list = urisRef.current.map(toTrackUri).filter(Boolean);
                            const idx = activeIndexRef.current;
                            const next = idx + 1;
                            if (next < list.length) {
                                onActiveIndexChange(next);
                                trackEndFired = false;
                            }
                        }
                    });
                },
            );
        });

        return () => {
            cancelled = true;
            controllerRef.current = null;
            el.innerHTML = '';
        };
    }, [uriKey, onActiveIndexChange]);

    useEffect(() => {
        const c = controllerRef.current;
        if (!c || uris.length === 0) {
            return;
        }
        const normalized = uris.map(toTrackUri).filter(Boolean);
        const uri = normalized[activeIndex];
        if (!uri) {
            return;
        }
        if (skipLoadUriAfterCreateRef.current) {
            skipLoadUriAfterCreateRef.current = false;
            /** Effect often runs before the async embed exists; skip only avoids reloading the same URI */
            if (uri === embeddedUriRef.current) {
                return;
            }
        }
        c.loadUri(uri);
        c.play();
    }, [activeIndex, uriKey, uris]);

    const handleTogglePlay = useCallback(() => {
        controllerRef.current?.togglePlay();
    }, []);

    const handlePrevious = useCallback(() => {
        if (activeIndex <= 0) {
            return;
        }
        onActiveIndexChange(activeIndex - 1);
    }, [activeIndex, onActiveIndexChange]);

    const handleNext = useCallback(() => {
        if (activeIndex >= uris.length - 1) {
            return;
        }
        onActiveIndexChange(activeIndex + 1);
    }, [activeIndex, onActiveIndexChange, uris.length]);

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

    return (
        <div style={{ width: '100%' }}>
            <div ref={containerRef} style={{ width: '100%', minHeight: 152 }} />
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
        </div>
    );
}
