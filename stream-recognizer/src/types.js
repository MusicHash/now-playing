/**
 * @typedef {Object} StationConfig
 * @property {string} id
 * @property {string} streamUrl
 * @property {boolean} [enabled]
 * @property {number|null} [intervalMs]
 * @property {number} [vadAggressive] 0-3 for webrtcvad-style; mapped to heuristic strictness
 * @property {number|null} [rmsSilenceDb] override env RMS_SILENCE_DB
 */

/**
 * `stations.json` shape: `{ [id]: StationProps }` — id is the key only, not repeated inside entries.
 * @typedef {Omit<StationConfig, 'id'>} StationProps
 */

/**
 * @typedef {Object} RecognitionResult
 * @property {string} artist
 * @property {string} title
 * @property {'acrcloud'|'acoustid'|'shazam'|'skipped'} source
 * @property {string} provider
 * @property {string} [rawTitle]
 * @property {string} [fingerprint]
 * @property {string} [skipReason]
 * @property {string} [isrc]
 * @property {string} [shazamKey]
 */

export {};
