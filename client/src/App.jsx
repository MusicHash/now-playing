import { useEffect, useLayoutEffect, useState } from 'react';
import { NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import GeneratePlaylistPage from './components/GeneratePlaylistPage.jsx';
import RadioStatsDashboard from './components/RadioStatsDashboard.jsx';
import WelcomePage from './components/WelcomePage.jsx';
import { buildDocumentTitle } from './lib/documentTitle.js';

const navButtonBase = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.65rem 0.85rem',
    borderRadius: '6px',
    border: '1px solid transparent',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    cursor: 'pointer',
    marginBottom: '0.35rem',
    textDecoration: 'none',
    boxSizing: 'border-box',
};

function AppLayout() {
    const [status, setStatus] = useState('loading');
    const location = useLocation();

    useLayoutEffect(() => {
        document.title = buildDocumentTitle(location.pathname, location.search);
    }, [location.pathname, location.search]);

    useEffect(() => {
        fetch('/api/health')
            .then((res) => {
                setStatus(res.ok ? 'connected' : 'error');
            })
            .catch(() => {
                setStatus('error');
            });
    }, []);

    return (
        <div
            style={{
                fontFamily: 'system-ui, sans-serif',
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
            }}
        >
            <aside
                style={{
                    width: '200px',
                    flexShrink: 0,
                    padding: '1.5rem 1rem',
                    borderRight: '1px solid #e2e8f0',
                    background: '#f8fafc',
                }}
            >
                <nav aria-label="Main">
                    <NavLink
                        to="/"
                        end
                        style={({ isActive }) => ({
                            ...navButtonBase,
                            background: isActive ? '#e0f2fe' : 'transparent',
                            color: isActive ? '#0369a1' : '#475569',
                            borderColor: isActive ? '#7dd3fc' : 'transparent',
                            fontWeight: isActive ? 600 : 400,
                        })}
                    >
                        Home
                    </NavLink>
                    <NavLink
                        to="/metrics"
                        style={({ isActive }) => ({
                            ...navButtonBase,
                            background: isActive ? '#e0f2fe' : 'transparent',
                            color: isActive ? '#0369a1' : '#475569',
                            borderColor: isActive ? '#7dd3fc' : 'transparent',
                            fontWeight: isActive ? 600 : 400,
                        })}
                    >
                        Play metrics
                    </NavLink>
                    <NavLink
                        to="/playlist"
                        style={({ isActive }) => ({
                            ...navButtonBase,
                            background: isActive ? '#e0f2fe' : 'transparent',
                            color: isActive ? '#0369a1' : '#475569',
                            borderColor: isActive ? '#7dd3fc' : 'transparent',
                            fontWeight: isActive ? 600 : 400,
                        })}
                    >
                        Generate Playlist
                    </NavLink>
                </nav>
            </aside>
            <div style={{ flex: 1, padding: '2rem', minWidth: 0 }}>
                <div style={{ maxWidth: '1100px' }}>
                    <header style={{ marginBottom: '0.5rem' }}>
                        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem' }}>Now Playing</h1>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
                            API status:{' '}
                            <span style={{ color: status === 'connected' ? '#16a34a' : '#dc2626' }}>
                                {status}
                            </span>
                        </p>
                    </header>
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

function App() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route index element={<WelcomePage />} />
                <Route path="metrics" element={<RadioStatsDashboard />} />
                <Route path="playlist" element={<GeneratePlaylistPage />} />
            </Route>
        </Routes>
    );
}

export default App;
