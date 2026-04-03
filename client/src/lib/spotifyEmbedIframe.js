/** @type {Promise<unknown> | null} */
let iframeApiPromise = null;

/**
 * Resolves to Spotify Embed IFrame API (singleton script load).
 * @returns {Promise<unknown>}
 */
export function getSpotifyIFrameAPI() {
    if (!iframeApiPromise) {
        iframeApiPromise = new Promise((resolve) => {
            if (typeof window === 'undefined') {
                return;
            }
            const w = window;
            if (w.__spotifyIFrameAPI) {
                resolve(w.__spotifyIFrameAPI);
                return;
            }
            const prev = w.onSpotifyIframeApiReady;
            w.onSpotifyIframeApiReady = (IFrameAPI) => {
                w.__spotifyIFrameAPI = IFrameAPI;
                if (typeof prev === 'function') {
                    prev(IFrameAPI);
                }
                resolve(IFrameAPI);
            };
            const existing = document.querySelector(
                'script[src="https://open.spotify.com/embed/iframe-api/v1"]',
            );
            if (!existing) {
                const s = document.createElement('script');
                s.src = 'https://open.spotify.com/embed/iframe-api/v1';
                s.async = true;
                document.body.appendChild(s);
            }
        });
    }
    return iframeApiPromise;
}
