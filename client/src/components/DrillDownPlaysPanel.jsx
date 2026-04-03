import { useEffect, useState } from 'react';
import PlaysBucketChart from './PlaysBucketChart.jsx';
import {
    BUCKET_RESOLUTION_OPTIONS,
    clampBucketMinutes,
    clampInt,
    DEFAULT_STATS_DAYS,
    fetchJson,
    getPlaysByBucketArtistUrl,
    getPlaysByBucketTrackUrl,
    MAX_STATS_DAYS,
} from '../lib/statsApi.js';

const panelStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1rem 1.25rem',
    background: '#f8fafc',
    marginBottom: '0.5rem',
};

const headerStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '1rem',
};

const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#475569' };
const selectStyle = {
    padding: '0.4rem 0.5rem',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.9rem',
};

/**
 * @param {{
 *   drill: { type: 'track', trackId: string, label: string } | { type: 'artist', artistName: string, label: string },
 *   days: number,
 *   station: string,
 *   width: number,
 *   resolutionMinutes: number,
 *   onResolutionMinutesChange: (n: number) => void,
 *   onClose: () => void,
 * }} props
 */
export default function DrillDownPlaysPanel({
    drill,
    days,
    station,
    width,
    resolutionMinutes,
    onResolutionMinutesChange,
    onClose,
}) {
    const [data, setData] = useState(null);
    const [compareData, setCompareData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const d = clampInt(days, DEFAULT_STATS_DAYS, MAX_STATS_DAYS);
        const res = clampBucketMinutes(resolutionMinutes);
        const run =
            drill.type === 'track'
                ? (() => {
                      const base = {
                          days: d,
                          resolutionMinutes: res,
                          spotify_track_id: drill.trackId,
                      };
                      const scopedUrl = getPlaysByBucketTrackUrl({ ...base, station });
                      const allUrl = getPlaysByBucketTrackUrl(base);
                      return station
                          ? Promise.all([fetchJson(scopedUrl), fetchJson(allUrl)]).then(
                                ([scopedRows, allRows]) => {
                                    if (!cancelled) {
                                        setData(scopedRows);
                                        setCompareData(allRows);
                                    }
                                },
                            )
                          : fetchJson(allUrl).then((rows) => {
                                if (!cancelled) {
                                    setData(rows);
                                    setCompareData(null);
                                }
                            });
                  })()
                : (() => {
                      const base = {
                          days: d,
                          resolutionMinutes: res,
                          artist: drill.artistName,
                      };
                      const scopedUrl = getPlaysByBucketArtistUrl({ ...base, station });
                      const allUrl = getPlaysByBucketArtistUrl(base);
                      return station
                          ? Promise.all([fetchJson(scopedUrl), fetchJson(allUrl)]).then(
                                ([scopedRows, allRows]) => {
                                    if (!cancelled) {
                                        setData(scopedRows);
                                        setCompareData(allRows);
                                    }
                                },
                            )
                          : fetchJson(allUrl).then((rows) => {
                                if (!cancelled) {
                                    setData(rows);
                                    setCompareData(null);
                                }
                            });
                  })();

        run.catch((e) => {
            if (!cancelled) {
                setError(e);
            }
        }).finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [drill, days, station, resolutionMinutes]);

    const chartTitle =
        drill.type === 'track' ? 'Plays over time (track)' : 'Plays over time (artist)';

    const scopeHint = station ? `Station filter: ${station}` : 'All stations';

    return (
        <div style={panelStyle}>
            <div style={headerStyle}>
                <div>
                    <h3
                        style={{
                            margin: '0 0 0.25rem',
                            fontSize: '1.05rem',
                            color: '#0f172a',
                        }}
                    >
                        {drill.type === 'track' ? 'Track detail' : 'Artist detail'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>{drill.label}</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                        {scopeHint} · same days window as above
                    </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label htmlFor="drill-resolution" style={labelStyle}>
                            Resolution
                        </label>
                        <select
                            id="drill-resolution"
                            value={resolutionMinutes}
                            onChange={(e) => onResolutionMinutesChange(Number(e.target.value))}
                            style={selectStyle}
                        >
                            {BUCKET_RESOLUTION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '0.45rem 0.85rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
            <PlaysBucketChart
                data={data}
                compareData={station ? compareData : undefined}
                primarySeriesLabel={station ? station : 'This station'}
                compareSeriesLabel="All stations"
                width={width}
                loading={loading}
                error={error}
                resolutionMinutes={resolutionMinutes}
                chartTitle={chartTitle}
            />
        </div>
    );
}
