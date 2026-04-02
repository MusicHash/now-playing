import {
    DEFAULT_STATS_DAYS,
    DEFAULT_STATS_LIMIT,
    MAX_STATS_DAYS,
    MAX_STATS_LIMIT,
} from '../lib/statsApi.js';

/**
 * @param {{
 *   days: number,
 *   onDaysChange: (n: number) => void,
 *   limit: number,
 *   onLimitChange: (n: number) => void,
 *   station: string,
 *   onStationChange: (s: string) => void,
 *   stationOptions: string[],
 * }} props
 */
export default function StatsControls({
    days,
    onDaysChange,
    limit,
    onLimitChange,
    station,
    onStationChange,
    stationOptions,
}) {
    const controlStyle = {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: '1rem',
        marginBottom: '1.5rem',
    };
    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.35rem' };
    const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#475569' };
    const inputStyle = {
        padding: '0.45rem 0.6rem',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        fontSize: '0.95rem',
        minWidth: '5rem',
    };

    return (
        <div style={controlStyle}>
            <div style={fieldStyle}>
                <label htmlFor="stats-days" style={labelStyle}>
                    Days window
                </label>
                <input
                    id="stats-days"
                    type="number"
                    min={1}
                    max={MAX_STATS_DAYS}
                    value={days}
                    onChange={(e) => onDaysChange(Number(e.target.value))}
                    style={inputStyle}
                />
            </div>
            <div style={fieldStyle}>
                <label htmlFor="stats-limit" style={labelStyle}>
                    Limit (ranked chart)
                </label>
                <input
                    id="stats-limit"
                    type="number"
                    min={1}
                    max={MAX_STATS_LIMIT}
                    value={limit}
                    onChange={(e) => onLimitChange(Number(e.target.value))}
                    style={inputStyle}
                />
            </div>
            <div style={fieldStyle}>
                <label htmlFor="stats-station" style={labelStyle}>
                    Station
                </label>
                <select
                    id="stats-station"
                    value={station}
                    onChange={(e) => onStationChange(e.target.value)}
                    style={{ ...inputStyle, minWidth: '14rem' }}
                >
                    <option value="">All stations</option>
                    {stationOptions.map((id) => (
                        <option key={id} value={id}>
                            {id}
                        </option>
                    ))}
                </select>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', maxWidth: '18rem' }}>
                Defaults: {DEFAULT_STATS_DAYS} days, {DEFAULT_STATS_LIMIT} rows. Omitting station
                aggregates all stations.
            </p>
        </div>
    );
}
