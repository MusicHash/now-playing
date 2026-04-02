import { useState, useEffect } from 'react';
import RadioStatsDashboard from './components/RadioStatsDashboard.jsx';

function App() {
    const [status, setStatus] = useState('loading');

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
        <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '1100px' }}>
            <header style={{ marginBottom: '0.5rem' }}>
                <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem' }}>Now Playing</h1>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
                    API status:{' '}
                    <span style={{ color: status === 'connected' ? '#16a34a' : '#dc2626' }}>
                        {status}
                    </span>
                </p>
            </header>
            <RadioStatsDashboard />
        </div>
    );
}

export default App;
