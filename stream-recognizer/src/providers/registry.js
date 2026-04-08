/**
 * Default provider sequence (documentation only; real order is `AUDIO_RECOGNITION_ORDER` →
 * {@link ../config.js#getAudioRecognitionOrder}).
 *
 * To add a provider: allow its id in `getAudioRecognitionOrder`, implement `src/providers/<id>.js`,
 * add a branch in `orchestrator.js`, and append here.
 */
export const PROVIDER_ORDER = ['shazam'];
