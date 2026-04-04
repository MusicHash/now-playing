import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlayerToken, refreshPlayerToken } from '../lib/spotifyPlayerAuth.js';

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';

/** Short label like "Chrome-120" for Spotify Connect device names. */
function getBrowserBrandMajorLabel() {
    if (typeof navigator === 'undefined') return 'Browser';

    const ua = navigator.userAgent;
    const brands = navigator.userAgentData?.brands;
    if (brands?.length) {
        const meaningful = brands.filter((b) => !/Not/i.test(b.brand));
        const pick =
            meaningful.find((b) => /Chrome/i.test(b.brand) && !/^Chromium$/i.test(b.brand)) ||
            meaningful.find((b) => !/^Chromium$/i.test(b.brand)) ||
            meaningful[0];
        if (pick?.version) {
            const major = String(pick.version).split('.')[0];
            let brand = pick.brand.replace(/^Google\s+/i, '').replace(/\s+Browser$/i, '');
            if (/^Microsoft\s+Edge$/i.test(brand)) brand = 'Edge';
            else if (/^Chrome$/i.test(brand)) brand = 'Chrome';
            return `${brand}-${major}`;
        }
    }

    let m;
    if ((m = ua.match(/Edg\/(\d+)/))) return `Edge-${m[1]}`;
    if ((m = ua.match(/OPR\/(\d+)/))) return `Opera-${m[1]}`;
    if ((m = ua.match(/SamsungBrowser\/(\d+)/))) return `Samsung-${m[1]}`;
    if ((m = ua.match(/Firefox\/(\d+)/))) return `Firefox-${m[1]}`;
    if ((m = ua.match(/CriOS\/(\d+)/))) return `Chrome-${m[1]}`;
    if ((m = ua.match(/FxiOS\/(\d+)/))) return `Firefox-${m[1]}`;
    if ((m = ua.match(/Chrome\/(\d+)/)) && !/Edg\/|OPR\//.test(ua)) return `Chrome-${m[1]}`;
    if (
        (m = ua.match(/Version\/(\d+)/)) &&
        /Safari\//.test(ua) &&
        !/Chrome\/|Chromium\/|Edg\/|OPR\/|CriOS\//.test(ua)
    ) {
        return `Safari-${m[1]}`;
    }
    return 'Browser';
}

export const WEB_PLAYBACK_DEVICE_NAME = `Now Playing (${getBrowserBrandMajorLabel()})`;

let sdkPromise = null;

function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve) => {
        if (window.Spotify?.Player) {
            resolve(window.Spotify);
            return;
        }
        const prev = window.onSpotifyWebPlaybackSDKReady;
        window.onSpotifyWebPlaybackSDKReady = () => {
            if (typeof prev === 'function') prev();
            resolve(window.Spotify);
        };
        if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
            const s = document.createElement('script');
            s.src = SDK_SRC;
            s.async = true;
            document.body.appendChild(s);
        }
    });
    return sdkPromise;
}

/**
 * Hook that initialises the Spotify Web Playback SDK so the browser
 * registers as a Connect device. Returns the SDK device_id (or null
 * while connecting) and an `isReady` flag.
 *
 * @param {boolean} enabled  Whether the SDK should be active.
 * @returns {{ deviceId: string | null, isReady: boolean, error: string | null }}
 */
export default function useSpotifyWebPlayback(enabled) {
    const [deviceId, setDeviceId] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const playerRef = useRef(null);

    const getOAuthToken = useCallback(async (cb) => {
        let token = getPlayerToken();
        if (!token) token = await refreshPlayerToken();
        cb(token || '');
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;

        loadSdk().then((Spotify) => {
            if (cancelled) return;

            const player = new Spotify.Player({
                name: WEB_PLAYBACK_DEVICE_NAME,
                getOAuthToken: (cb) => { getOAuthToken(cb); },
                volume: 0.5,
            });

            playerRef.current = player;

            player.addListener('ready', ({ device_id }) => {
                if (cancelled) return;
                setDeviceId(device_id);
                setIsReady(true);
                setError(null);
            });

            player.addListener('not_ready', () => {
                if (cancelled) return;
                setIsReady(false);
            });

            player.addListener('initialization_error', ({ message }) => {
                if (cancelled) return;
                setError(message);
            });

            player.addListener('authentication_error', ({ message }) => {
                if (cancelled) return;
                setError(message);
            });

            player.addListener('account_error', ({ message }) => {
                if (cancelled) return;
                setError(message);
            });

            player.connect();
        });

        return () => {
            cancelled = true;
            if (playerRef.current) {
                playerRef.current.disconnect();
                playerRef.current = null;
            }
            setDeviceId(null);
            setIsReady(false);
            setError(null);
        };
    }, [enabled, getOAuthToken]);

    return { deviceId, isReady, error };
}
