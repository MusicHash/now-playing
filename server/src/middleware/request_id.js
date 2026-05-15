import { sentryEnabled, Sentry } from '../sentry.js';
import {
    resolveRequestIdForHttpRequest,
    runWithRequestContext,
} from '../utils/request_context.js';

/**
 * Assigns {@link import('express').Request#requestId}, sets {@code X-Request-Id} on the response,
 * and binds {@code requestId} in AsyncLocalStorage so {@link ../utils/logger.js} can append it to every log line.
 */
export default function requestIdMiddleware() {
    return (req, res, next) => {
        const requestId = resolveRequestIdForHttpRequest(req);
        req.requestId = requestId;
        res.setHeader('X-Request-Id', requestId);

        if (sentryEnabled) {
            try {
                Sentry.getCurrentScope().setTag('request_id', requestId);
            } catch {
                // Sentry not ready in some test/bootstrap paths
            }
        }

        runWithRequestContext({ requestId }, () => {
            next();
        });
    };
}
