import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** MySQL `DAYOFWEEK`: 1 = Sunday … 7 = Saturday → Monday-first column index 0–6. */
function mysqlDowToMondayIndex(dow) {
    const d = Number(dow);
    if (!Number.isFinite(d)) {
        return 0;
    }
    if (d === 1) {
        return 6;
    }
    return d - 2;
}

/**
 * @param {{
 *   data: unknown[] | null,
 *   width: number,
 *   loading: boolean,
 *   error: Error | null,
 *   scopeAllStations?: boolean,
 * }} props
 */
export default function HourWeekdayHeatmap({ data, width, loading, error, scopeAllStations = true }) {
    const svgRef = useRef(null);

    useEffect(() => {
        if (!svgRef.current || loading || error) {
            return;
        }
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const w = Math.max(width, 280);
        const cellH = 14;
        const cellW = Math.max(16, Math.floor((w - 72) / 7));
        const margin = { top: 36, right: 16, bottom: 40, left: 36 };
        const innerW = cellW * 7;
        const innerH = cellH * 24;
        const height = margin.top + innerH + margin.bottom;

        /** @type {number[][]} */
        const grid = Array.from({ length: 24 }, () => Array(7).fill(0));
        if (data?.length) {
            for (const row of data) {
                const h = Number(row.play_hour);
                const dow = Number(row.dow);
                const c = Number(row.play_count) || 0;
                if (!Number.isFinite(h) || h < 0 || h > 23) {
                    continue;
                }
                const col = mysqlDowToMondayIndex(dow);
                if (col >= 0 && col < 7) {
                    grid[h][col] += c;
                }
            }
        }

        const flat = grid.flat();
        const maxC = d3.max(flat);
        if (!data?.length || maxC === undefined || maxC === 0) {
            svg
                .attr('width', w)
                .attr('height', 120)
                .append('text')
                .attr('x', w / 2)
                .attr('y', 64)
                .attr('text-anchor', 'middle')
                .attr('fill', '#64748b')
                .text('No play data in this window');
            return;
        }

        const color = d3.scaleSequential(d3.interpolateRgb('#f1f5f9', '#6366f1')).domain([0, maxC]);

        const x = d3.scaleBand().domain(WEEKDAY_LABELS).range([0, innerW]).paddingInner(0.05);
        const y = d3
            .scaleBand()
            .domain(d3.range(24).map(String))
            .range([0, innerH])
            .paddingInner(0.05);

        const g = svg
            .attr('width', w)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('text')
            .attr('x', innerW / 2)
            .attr('y', -14)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('font-weight', 600)
            .attr('fill', '#334155')
            .text('Plays by local hour and weekday');

        for (let hour = 0; hour < 24; hour++) {
            for (let col = 0; col < 7; col++) {
                const v = grid[hour][col];
                g.append('rect')
                    .attr('x', x(WEEKDAY_LABELS[col]))
                    .attr('y', y(String(hour)))
                    .attr('width', x.bandwidth())
                    .attr('height', y.bandwidth())
                    .attr('fill', color(v))
                    .attr('rx', 2)
                    .append('title')
                    .text(`${WEEKDAY_LABELS[col]} ${hour}:00–${hour}:59 · ${v} plays`);
            }
        }

        g.append('g')
            .attr('transform', `translate(0,${innerH})`)
            .call(d3.axisBottom(x));

        g.append('g').call(
            d3.axisLeft(y).tickValues(['0', '6', '12', '18', '23']).tickFormat((d) => `${d}:00`),
        );

        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -innerH / 2)
            .attr('y', -26)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('fill', '#64748b')
            .text('Hour (local)');
    }, [data, width, loading, error]);

    const title = scopeAllStations
        ? 'Listening rhythm (hour × weekday) — all stations'
        : 'Listening rhythm (hour × weekday) — this station';

    const hint =
        'Aggregated over the selected days window using each log row’s local hour and weekday (server timezone).';

    return (
        <div style={{ width: '100%' }}>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem', color: '#64748b' }}>{title}</h2>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>{hint}</p>
            {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
            {error && (
                <p style={{ color: '#b91c1c' }}>
                    {error.status === 503
                        ? 'MySQL is not configured or stats are unavailable.'
                        : error.message}
                </p>
            )}
            {!loading && !error && <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%' }} />}
        </div>
    );
}
