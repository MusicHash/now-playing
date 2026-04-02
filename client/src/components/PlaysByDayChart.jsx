import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

export const PLAYS_CHART_HEIGHT = 300;

/**
 * @param {unknown} raw
 */
function parsePlayDate(raw) {
    if (raw instanceof Date) {
        return raw;
    }
    if (typeof raw === 'string') {
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? new Date(0) : d;
    }
    return new Date(0);
}

/**
 * @param {{
 *   data: unknown[] | null,
 *   width: number,
 *   loading: boolean,
 *   error: Error | null,
 * }} props
 */
export default function PlaysByDayChart({ data, width, loading, error }) {
    const svgRef = useRef(null);
    const height = PLAYS_CHART_HEIGHT;

    useEffect(() => {
        if (!svgRef.current || loading || error) {
            return;
        }
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const w = Math.max(width, 280);
        if (!data?.length) {
            svg
                .attr('width', w)
                .attr('height', height)
                .append('text')
                .attr('x', w / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .attr('fill', '#64748b')
                .text('No play data in this window');
            return;
        }

        const margin = { top: 28, right: 20, bottom: 48, left: 56 };
        const innerW = w - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const parsed = data
            .map((d) => ({
                date: parsePlayDate(d.play_date),
                count: Number(d.play_count) || 0,
            }))
            .sort((a, b) => a.date - b.date);

        const x = d3
            .scaleTime()
            .domain(d3.extent(parsed, (d) => d.date))
            .range([0, innerW]);

        const maxY = d3.max(parsed, (d) => d.count) || 1;
        const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0]);

        const area = d3
            .area()
            .x((d) => x(d.date))
            .y0(innerH)
            .y1((d) => y(d.count));

        const line = d3
            .line()
            .x((d) => x(d.date))
            .y((d) => y(d.count));

        const g = svg
            .attr('width', w)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('path')
            .datum(parsed)
            .attr('fill', 'rgba(99, 102, 241, 0.12)')
            .attr('d', area);

        g.append('path')
            .datum(parsed)
            .attr('fill', 'none')
            .attr('stroke', '#6366f1')
            .attr('stroke-width', 2)
            .attr('d', line);

        g.append('g')
            .attr('transform', `translate(0,${innerH})`)
            .call(
                d3
                    .axisBottom(x)
                    .ticks(Math.min(10, parsed.length))
                    .tickFormat(d3.timeFormat('%b %d')),
            )
            .call((sel) => sel.selectAll('text').attr('transform', 'rotate(-35)').style('text-anchor', 'end'));

        g.append('g').call(d3.axisLeft(y).ticks(6));

        g.append('text')
            .attr('x', innerW / 2)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('font-weight', 600)
            .attr('fill', '#334155')
            .text('Plays by day');
    }, [data, width, height, loading, error]);

    return (
        <div style={{ width: '100%' }}>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem', color: '#64748b' }}>Activity</h2>
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
