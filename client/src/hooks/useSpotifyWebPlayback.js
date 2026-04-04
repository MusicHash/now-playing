import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlayerToken, refreshPlayerToken } from '../lib/spotifyPlayerAuth.js';

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
export const WEB_PLAYBACK_DEVICE_NAME = 'Now Playing (Browser)';

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
