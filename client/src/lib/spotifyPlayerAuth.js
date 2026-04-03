const LS_ACCESS_TOKEN = 'sp_player_access_token';
const LS_REFRESH_TOKEN = 'sp_player_refresh_token';
const LS_EXPIRES_AT = 'sp_player_expires_at';

let refreshTimer = null;

function scheduleRefresh() {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }

    const expiresAt = Number(localStorage.getItem(LS_EXPIRES_AT) || 0);
    if (!expiresAt) return;

    const msUntilRefresh = expiresAt - Date.now() - 5 * 60 * 1000;
    if (msUntilRefresh <= 0) {
        refreshPlayerToken();
        return;
    }

    refreshTimer = setTimeout(refreshPlayerToken, msUntilRefresh);
}

function storeTokens(accessToken, refreshToken, expiresIn) {
    localStorage.setItem(LS_ACCESS_TOKEN, accessToken);
    if (refreshToken) {
        localStorage.setItem(LS_REFRESH_TOKEN, refreshToken);
    }
    localStorage.setItem(LS_EXPIRES_AT, String(Date.now() + expiresIn * 1000));
    scheduleRefresh();
}

/**
 * Read OAuth tokens from the URL hash (set by the server callback redirect)
 * and persist them. Returns true if tokens were consumed.
 */
export function consumeHashTokens() {
    if (typeof window === 'undefined') return false;

    const hash = window.location.hash.substring(1);
    if (!hash) return false;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('playerAccessToken');
    const refreshToken = params.get('playerRefreshToken');
    const expiresIn = Number(params.get('playerExpiresIn'));

    if (!accessToken) return false;

    storeTokens(accessToken, refreshToken, expiresIn || 3600);

    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return true;
}

export function getPlayerToken() {
    return localStorage.getItem(LS_ACCESS_TOKEN) || null;
}

export function isPlayerAuthenticated() {
    const token = getPlayerToken();
    if (!token) return false;
    const expiresAt = Number(localStorage.getItem(LS_EXPIRES_AT) || 0);
    return expiresAt > Date.now();
}

export async function refreshPlayerToken() {
    const refreshToken = localStorage.getItem(LS_REFRESH_TOKEN);
    if (!refreshToken) {
        clearPlayerAuth();
        return null;
    }

    try {
        const res = await fetch('/api/player/token/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!res.ok) {
            if (res.status === 400 || res.status === 502) {
                clearPlayerAuth();
            }
            return null;
        }

        const data = await res.json();
        storeTokens(data.access_token, null, data.expires_in || 3600);
        return data.access_token;
    } catch {
        return null;
    }
}

export function clearPlayerAuth() {
    localStorage.removeItem(LS_ACCESS_TOKEN);
    localStorage.removeItem(LS_REFRESH_TOKEN);
    localStorage.removeItem(LS_EXPIRES_AT);
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
}

export function getPlayerLoginUrl() {
    return '/api/player/login';
}

/**
 * Make a Spotify Web API fetch with automatic token refresh on 401.
 */
export async function spotifyFetch(url, options = {}) {
    let token = getPlayerToken();
    if (!token) throw new Error('not_authenticated');

    const doFetch = (t) =>
        fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${t}`,
            },
        });

    let res = await doFetch(token);

    if (res.status === 401) {
        const newToken = await refreshPlayerToken();
        if (!newToken) throw new Error('token_refresh_failed');
        res = await doFetch(newToken);
    }

    return res;
}

// Eagerly consume hash tokens on module load
consumeHashTokens();
scheduleRefresh();
