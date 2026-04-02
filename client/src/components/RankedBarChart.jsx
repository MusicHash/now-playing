import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

const RANKED_HEIGHT = 420;

/**
 * @param {unknown} row
 * @param {'tracks' | 'artists'} mode
 */
function rowLabel(row, mode) {
    if (mode === 'artists') {
        return String(row.log_artist ?? '').trim() || '(unknown)';
    }
    const title = String(row.spotify_track_title ?? row.log_title ?? '');
    const artist = String(row.spotify_artist_title ?? row.log_artist ?? '');
    const s = `${title} — ${artist}`.trim();
    return s || '(unknown)';
}

/**
 * @param {string} s
 * @param {number} maxLen
 */
function truncate(s, maxLen) {
    if (s.length <= maxLen) {
        return s;
    }
    return `${s.slice(0, maxLen - 1)}…`;
}

/**
 * @param {{
 *   data: unknown[] | null,
 *   width: number,
 *   loading: boolean,
 *   error: Error | null,
 *   mode: 'tracks' | 'artists',
 *   scopeAllStations?: boolean,
 * }} props
 */
export default function RankedBarChart({ data, width, loading, error, mode, scopeAllStations = true }) {
    const svgRef = useRef(null);
    const height = RANKED_HEIGHT;

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
                .text('No ranked data in this window');
            return;
        }

        const rows = data.map((row) => ({
            label: rowLabel(row, mode),
            count: Number(row.play_count) || 0,
        }));

        const barFill =
            mode === 'artists'
                ? 'rgba(20, 184, 166, 0.9)'
                : 'rgba(99, 102, 241, 0.85)';

        const margin = { top: 28, right: 20, bottom: 32, left: 8 };
        const labelCol = Math.min(220, Math.floor(w * 0.42));
        const barStart = Math.max(120, labelCol);
        const innerW = w - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        const barWidth = innerW - barStart;

        const y = d3
            .scaleBand()
            .domain(rows.map((_, i) => String(i)))
            .range([0, innerH])
            .padding(0.15);

        const maxX = d3.max(rows, (r) => r.count) || 1;
        const x = d3.scaleLinear().domain([0, maxX]).nice().range([0, barWidth]);

        const g = svg
            .attr('width', w)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('text')
            .attr('x', innerW / 2)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('font-weight', 600)
            .attr('fill', '#334155')
            .text(mode === 'artists' ? 'Top artists' : 'Top tracks');

        const rowG = g
            .selectAll('g.row')
            .data(rows)
            .join('g')
            .attr('class', 'row')
            .attr('transform', (_d, i) => `translate(0,${y(String(i))})`);

        rowG.each(function (d) {
            const te = d3
                .select(this)
                .append('text')
                .attr('x', 0)
                .attr('y', y.bandwidth() / 2)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'start')
                .attr('font-size', '11px')
                .attr('fill', '#334155')
                .text(truncate(d.label, 42));
            te.append('title').text(d.label);
        });

        rowG
            .append('rect')
            .attr('x', barStart)
            .attr('width', (d) => x(d.count))
            .attr('height', y.bandwidth())
            .attr('fill', barFill)
            .attr('rx', 3);

        rowG
            .append('text')
            .attr('x', (d) => barStart + x(d.count) + 6)
            .attr('y', y.bandwidth() / 2)
            .attr('dy', '0.35em')
            .attr('font-size', '11px')
            .attr('fill', '#475569')
            .text((d) => d.count);

        g.append('g')
            .attr('transform', `translate(${barStart},${innerH})`)
            .call(d3.axisBottom(x).ticks(5));
    }, [data, width, height, loading, error, mode]);

    const title =
        mode === 'artists'
            ? scopeAllStations
                ? 'Artists with the most plays across all stations'
                : 'Artists with the most plays on this station'
            : scopeAllStations
              ? 'Most played tracks across all stations'
              : 'Most played tracks on this station';

    return (
        <div style={{ width: '100%' }}>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem', color: '#64748b' }}>{title}</h2>
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
