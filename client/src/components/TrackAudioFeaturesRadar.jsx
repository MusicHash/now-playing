import * as d3 from 'd3';
import { useCallback, useEffect, useRef, useState } from 'react';

const CHART_H = 232;
const FILL = 'rgba(244, 63, 94, 0.28)';
const STROKE = '#e11d48';
const GRID = '#cbd5e1';
const MUTED = '#94a3b8';

/**
 * @param {unknown} x
 */
function clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.max(0, Math.min(1, n));
}

/**
 * Spotify loudness in dB (−60 … 0) → 0–1 for the radar, matching percentage-style displays.
 * @param {unknown} l
 */
function loudnessToUnit(l) {
    return clamp01((Number(l) + 60) / 60);
}

const AXES = [
    { key: 'loudness', label: 'Loudness', toUnit: loudnessToUnit },
    { key: 'acousticness', label: 'Acousticness', toUnit: (v) => clamp01(v) },
    { key: 'danceability', label: 'Danceability', toUnit: (v) => clamp01(v) },
    { key: 'energy', label: 'Energy', toUnit: (v) => clamp01(v) },
    { key: 'instrumentalness', label: 'Instrumentalness', toUnit: (v) => clamp01(v) },
    { key: 'liveness', label: 'Liveness', toUnit: (v) => clamp01(v) },
    { key: 'speechiness', label: 'Speechiness', toUnit: (v) => clamp01(v) },
    { key: 'valence', label: 'Valence', toUnit: (v) => clamp01(v) },
];

const N = AXES.length;

/**
 * @param {number} i axis index, 0 at 12 o'clock, clockwise
 * @param {number} r radius in px
 * @param {number} cx
 * @param {number} cy
 */
function angleForAxis(i, r, cx, cy) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    return { a, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * @param {{
 *   data: Record<string, number> | null,
 *   width: number,
 *   loading: boolean,
 *   error: Error | null,
 * }} props
 */
export default function TrackAudioFeaturesRadar({ data, width, loading, error }) {
    const svgRef = useRef(null);
    const wrapRef = useRef(null);
    const [tip, setTip] = useState(
        /** @type {{ x: number, y: number, label: string, pct: number } | null} */ (null),
    );

    const clearTip = useCallback(() => {
        setTip(null);
    }, []);

    useEffect(() => {
        if (!svgRef.current || loading || error) {
            return;
        }
        const w = Math.max(200, width);
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        if (!data) {
            svg
                .attr('width', w)
                .attr('height', CHART_H)
                .append('text')
                .attr('x', w / 2)
                .attr('y', CHART_H / 2)
                .attr('text-anchor', 'middle')
                .attr('fill', MUTED)
                .attr('font-size', '11px')
                .text('No audio features in database for this track');
            return;
        }

        const margin = 10;
        const labelR = 34;
        const cx = w / 2;
        const cy = CHART_H / 2;
        const rMax = Math.max(32, Math.min(w, CHART_H) / 2 - margin - labelR);

        const values = AXES.map((ax) => ax.toUnit(data[ax.key]));
        const ringLevels = [0.25, 0.5, 0.75, 1];

        const g = svg
            .attr('width', w)
            .attr('height', CHART_H)
            .append('g')
            .attr('class', 'audio-features-radar');

        g.append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', w)
            .attr('height', CHART_H)
            .attr('fill', 'transparent')
            .attr('pointer-events', 'all')
            .on('mouseleave', clearTip);

        for (const t of ringLevels) {
            const pts = d3.range(N).map((i) => {
                const p = angleForAxis(i, rMax * t, cx, cy);
                return [p.x, p.y];
            });
            g.append('path')
                .attr('d', d3.line().curve(d3.curveLinearClosed)(pts))
                .attr('fill', 'none')
                .attr('stroke', t === 1 ? GRID : '#e2e8f0')
                .attr('stroke-width', 1);
        }

        for (let i = 0; i < N; i += 1) {
            const outer = angleForAxis(i, rMax, cx, cy);
            g.append('line')
                .attr('x1', cx)
                .attr('y1', cy)
                .attr('x2', outer.x)
                .attr('y2', outer.y)
                .attr('stroke', GRID)
                .attr('stroke-width', 1);
        }

        const lineClosed = d3
            .line()
            .curve(d3.curveLinearClosed);
        const polyPts = d3.range(N).map((i) => {
            const u = values[i] ?? 0;
            const p = angleForAxis(i, rMax * u, cx, cy);
            return [p.x, p.y];
        });
        g.append('path')
            .datum(polyPts)
            .attr('d', lineClosed)
            .attr('fill', FILL)
            .attr('stroke', STROKE)
            .attr('stroke-width', 1.5)
            .attr('pointer-events', 'none');

        for (let i = 0; i < N; i += 1) {
            const u = values[i] ?? 0;
            const p = angleForAxis(i, rMax * u, cx, cy);
            const labelPos = angleForAxis(i, rMax + labelR, cx, cy);
            g.append('text')
                .attr('x', labelPos.x)
                .attr('y', labelPos.y)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('font-size', '9px')
                .attr('font-weight', 500)
                .attr('fill', '#64748b')
                .text(AXES[i].label);

            g.append('circle')
                .attr('cx', p.x)
                .attr('cy', p.y)
                .attr('r', 5)
                .attr('fill', STROKE)
                .attr('stroke', '#fff')
                .attr('stroke-width', 1)
                .style('cursor', 'default')
                .on('mouseenter', function (event) {
                    event.stopPropagation();
                    const el = /** @type {SVGCircleElement} */ (this);
                    const b = el.getBoundingClientRect();
                    const wrap = wrapRef.current;
                    if (!wrap) {
                        return;
                    }
                    const br = wrap.getBoundingClientRect();
                    const pct = Math.round((values[i] ?? 0) * 100);
                    setTip({
                        x: b.left - br.left + b.width / 2,
                        y: b.top - br.top,
                        label: AXES[i].label,
                        pct,
                    });
                    d3.select(el).attr('r', 6).attr('stroke-width', 2);
                })
                .on('mouseleave', function () {
                    d3.select(this).attr('r', 5).attr('stroke-width', 1);
                });
        }
    }, [data, width, loading, error, clearTip]);

    return (
        <div
            ref={wrapRef}
            style={{ position: 'relative', width: '100%' }}
        >
            {loading && <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>Loading&hellip;</p>}
            {error && (
                <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.8rem' }} role="alert">
                    {error.status === 503
                        ? 'MySQL is not configured or stats are unavailable.'
                        : error.message}
                </p>
            )}
            {!loading && !error && (
                <>
                    <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%' }} />
                    {tip && (
                        <div
                            role="tooltip"
                            style={{
                                position: 'absolute',
                                left: tip.x,
                                top: tip.y,
                                transform: 'translate(-50%, calc(-100% - 6px))',
                                padding: '5px 8px',
                                borderRadius: '4px',
                                background: '#0f172a',
                                color: '#f8fafc',
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                pointerEvents: 'none',
                                whiteSpace: 'nowrap',
                                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.2)',
                            }}
                        >
                            {tip.label}
                            {': '}
                            <span style={{ fontWeight: 700 }}>{tip.pct}%</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
