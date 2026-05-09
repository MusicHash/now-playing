import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
if (sentryDsn) {
    const tracesSampleRate = Number(
        import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ??
            (import.meta.env.PROD ? 0.1 : 1),
    );

    Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_SENTRY_RELEASE,
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    });
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>,
);
