import { useState, useEffect } from 'react';
import RadioStatsDashboard from './components/RadioStatsDashboard.jsx';
import WelcomePage from './components/WelcomePage.jsx';

const SECTION_HOME = 'home';
const SECTION_PLAY_METRICS = 'play-metrics';

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
};

function App() {
    const [status, setStatus] = useState('loading');
    const [activeSection, setActiveSection] = useState(SECTION_HOME);

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
                    <button
                        type="button"
                        onClick={() => setActiveSection(SECTION_HOME)}
                        style={{
                            ...navButtonBase,
                            background: activeSection === SECTION_HOME ? '#e0f2fe' : 'transparent',
                            color: activeSection === SECTION_HOME ? '#0369a1' : '#475569',
                            borderColor: activeSection === SECTION_HOME ? '#7dd3fc' : 'transparent',
                            fontWeight: activeSection === SECTION_HOME ? 600 : 400,
                        }}
                    >
                        Home
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSection(SECTION_PLAY_METRICS)}
                        style={{
                            ...navButtonBase,
                            background:
                                activeSection === SECTION_PLAY_METRICS ? '#e0f2fe' : 'transparent',
                            color: activeSection === SECTION_PLAY_METRICS ? '#0369a1' : '#475569',
                            borderColor:
                                activeSection === SECTION_PLAY_METRICS ? '#7dd3fc' : 'transparent',
                            fontWeight: activeSection === SECTION_PLAY_METRICS ? 600 : 400,
                        }}
                    >
                        Play metrics
                    </button>
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
                    {activeSection === SECTION_HOME ? (
                        <WelcomePage />
                    ) : (
                        <RadioStatsDashboard />
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
