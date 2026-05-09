import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim();

export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
    const tracesSampleRate = Number(
        process.env.SENTRY_TRACES_SAMPLE_RATE ??
            (process.env.NODE_ENV === 'production' ? 0.1 : 1),
    );

    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.SENTRY_RELEASE,
        tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    });
}

export function attachSentryToExpress(app) {
    if (sentryEnabled) {
        Sentry.setupExpressErrorHandler(app);
    }
}

export { Sentry };
