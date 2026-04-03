export default function WelcomePage() {
    return (
        <section style={{ marginTop: '0.5rem' }}>
            <h2 style={{ fontSize: '1.35rem', margin: '0 0 1rem', color: '#0f172a' }}>
                Welcome
            </h2>
            <p style={{ margin: '0 0 1rem', lineHeight: 1.6, color: '#334155', maxWidth: '52ch' }}>
                Now Playing is a small dashboard for radio play logs. Use the navigation to explore
                aggregated plays over time, track momentum, top tracks and artists, and drill into
                individual songs or artists when you need more detail.
            </p>
            <p style={{ margin: 0, lineHeight: 1.6, color: '#64748b', maxWidth: '52ch', fontSize: '0.95rem' }}>
                Open <strong style={{ color: '#475569' }}>Play metrics</strong> in the sidebar when
                you are ready to browse the charts and filters.
            </p>
        </section>
    );
}
