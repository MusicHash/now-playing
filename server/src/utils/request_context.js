import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const storage = new AsyncLocalStorage();

/**
 * Returns the AsyncLocalStorage store for the current async context (HTTP request), if any.
 */
export function getRequestContextStore() {
    return storage.getStore();
}

/** @param {{ requestID: string }} ctx */
export function runWithRequestContext(ctx, fn) {
    return storage.run(ctx, fn);
}

function normalizeIncomingRequestID(raw) {
    if (raw == null) {
        return null;
    }
    const s = String(raw).trim();
    if (!s) {
        return null;
    }
    const cleaned = s.slice(0, 128).replace(/[^a-zA-Z0-9\-_.]/g, '');
    return cleaned.length > 0 ? cleaned : null;
}

/** @param {import('express').Request} req */
export function resolveRequestIDForHttpRequest(req) {
    const fromQuery = normalizeIncomingRequestID(
        req.query?.requestID ?? req.query?.requestId ?? req.query?.request_id,
    );
    if (fromQuery) {
        return fromQuery;
    }
    const fromHeader =
        normalizeIncomingRequestID(req.get?.('x-request-id')) ??
        normalizeIncomingRequestID(req.get?.('x-correlation-id'));
    if (fromHeader) {
        return fromHeader;
    }
    return randomUUID();
}
