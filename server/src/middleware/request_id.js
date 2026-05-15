import { sentryEnabled, Sentry } from '../sentry.js';
import {
    resolveRequestIDForHttpRequest,
    runWithRequestContext,
} from '../utils/request_context.js';

/**
 * Assigns {@link import('express').Request#requestID}, sets {@code X-Request-Id} on the response,
 * and binds {@code requestID} in AsyncLocalStorage so {@link ../utils/logger.js} can append it to every log line.
 */
export default function requestIDMiddleware() {
    return (req, res, next) => {
        const requestID = resolveRequestIDForHttpRequest(req);
        req.requestID = requestID;
        res.setHeader('X-Request-Id', requestID);

        if (sentryEnabled) {
            try {
                Sentry.getCurrentScope().setTag('requestID', requestID);
            } catch {
                // Sentry not ready in some test/bootstrap paths
            }
        }

        runWithRequestContext({ requestID }, () => {
            next();
        });
    };
}
