import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpotifyIFrameAPI } from '../lib/spotifyEmbedIframe.js';
import {
    PLAY_TYPE_REGULAR,
    PLAY_TYPE_SHUFFLE,
    REGULAR_PLAY_SYMBOL,
    SHUFFLE_SYMBOL,
} from '../lib/appSearchParams.js';

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
 *   playType: string,
 *   onPlayTypeChange: (next: string) => void,
 *   onNavigateNext: () => void,
 *   onNavigatePrevious: () => void,
 *   canNavigateNext: boolean,
 *   canNavigatePrevious: boolean,
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

export default function SpotifyEmbedPlayer({
    uris,
    activeIndex,
    onActiveIndexChange,
    playType,
    onPlayTypeChange,
    onNavigateNext,
    onNavigatePrevious,
    canNavigateNext,
    canNavigatePrevious,
}) {
    const containerRef = useRef(null);
    const controllerRef = useRef(null);
    const activeIndexRef = useRef(activeIndex);
    const urisRef = useRef(uris);
    const onNavigateNextRef = useRef(onNavigateNext);
    onNavigateNextRef.current = onNavigateNext;
    const canNavigateNextRef = useRef(canNavigateNext);
    canNavigateNextRef.current = canNavigateNext;
    /** URI passed to createController — only skip loadUri when still on that track */
    const embeddedUriRef = useRef('');
    /** Index the iframe was created with; same URI at a different row must still load. */
    const embeddedStartIndexRef = useRef(0);
    const skipLoadUriAfterCreateRef = useRef(true);
    const [isPaused, setIsPaused] = useState(true);
    /**
     * Incremented when auto-advance fires to force controller recreation with the new
     * track URI. Recreating the controller is necessary because calling c.loadUri() +
     * c.play() on an already-ended embed is blocked by browser autoplay policy, whereas
     * createController() with the new URI starts playback reliably (the user has already
     * interacted with the embed during this session).
     */
    const [autoAdvanceCount, setAutoAdvanceCount] = useState(0);

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
                    embeddedStartIndexRef.current = startIdx;
                    skipLoadUriAfterCreateRef.current = true;

                    if (autoAdvanceCount > 0) {
                        EmbedController.play();
                    }

                    let trackEndFired = false;
                    EmbedController.addListener('playback_update', (e) => {
                        const { position, duration, isPaused: paused } = e.data;
                        setIsPaused(!!paused);
                        if (duration <= 0) {
                            return;
                        }
                        if (position < duration - 500) {
                            trackEndFired = false;
                        }
                        if (!trackEndFired && position >= duration - 500) {
                            if (!canNavigateNextRef.current) {
                                trackEndFired = true;
                                return;
                            }
                            trackEndFired = true;
                            onNavigateNextRef.current();
                            setAutoAdvanceCount((n) => n + 1);
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
    }, [uriKey, autoAdvanceCount]);

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
            /** Same URI at another list index (duplicate tracks) must still loadUri + play */
            if (activeIndex === embeddedStartIndexRef.current && uri === embeddedUriRef.current) {
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
        onNavigatePrevious();
    }, [onNavigatePrevious]);

    const handleNext = useCallback(() => {
        onNavigateNext();
    }, [onNavigateNext]);

    const handlePlayTypeClick = useCallback(() => {
        onPlayTypeChange(playType === PLAY_TYPE_SHUFFLE ? PLAY_TYPE_REGULAR : PLAY_TYPE_SHUFFLE);
    }, [playType, onPlayTypeChange]);

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

    return (
        <div style={{ width: '100%' }}>
            <div ref={containerRef} style={{ width: '100%', minHeight: 152 }} />
            <div style={controlBarStyle}>
                <button
                    type="button"
                    style={{
                        ...controlButtonStyle,
                        opacity: canNavigatePrevious ? 1 : 0.45,
                        cursor: canNavigatePrevious ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!canNavigatePrevious}
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
                        opacity: canNavigateNext ? 1 : 0.45,
                        cursor: canNavigateNext ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!canNavigateNext}
                    onClick={handleNext}
                    aria-label="Next track"
                >
                    <span aria-hidden="true">⏭</span>
                </button>
                <button
                    type="button"
                    style={{
                        ...controlButtonStyle,
                        minWidth: '2.5rem',
                        padding: '0.5rem 0.65rem',
                        background: playType === PLAY_TYPE_SHUFFLE ? '#e0f2fe' : '#fff',
                        borderColor: playType === PLAY_TYPE_SHUFFLE ? '#0284c7' : '#cbd5e1',
                        color: playType === PLAY_TYPE_SHUFFLE ? '#0369a1' : '#475569',
                    }}
                    onClick={handlePlayTypeClick}
                    aria-pressed={playType === PLAY_TYPE_SHUFFLE}
                    title={playType === PLAY_TYPE_SHUFFLE ? 'Shuffle on' : 'Play in order'}
                    aria-label={
                        playType === PLAY_TYPE_SHUFFLE
                            ? 'Play in order: click for regular order'
                            : 'Shuffle: click to shuffle on next and previous'
                    }
                >
                    <span aria-hidden="true" style={{ fontSize: '1.1rem', lineHeight: 1 }}>
                        {playType === PLAY_TYPE_SHUFFLE ? SHUFFLE_SYMBOL : REGULAR_PLAY_SYMBOL}
                    </span>
                </button>
            </div>
        </div>
    );
}
