import { useState, useEffect } from 'react';

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
        <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
            <h1>Now Playing</h1>
            <p>
                API status:{' '}
                <span style={{ color: status === 'connected' ? '#22c55e' : '#ef4444' }}>
                    {status}
                </span>
            </p>
        </div>
    );
}

export default App;
