import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

const MOMENTUM_CHART_HEIGHT = 400;
/** Max simultaneous lines so the chart stays readable (plan: ~8–10). */
const CHART_LINE_CAP = 8;

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
 * @param {unknown} row
 */
function trackLabel(row) {
    const title = String(row.spotify_track_title ?? '');
    const artist = String(row.spotify_artist_title ?? '');
    const s = `${title} — ${artist}`.trim();
    return s || '(unknown)';
}

/**
 * @param {{
 *   data: unknown[] | null,
 *   width: number,
 *   loading: boolean,
 *   error: Error | null,
 *   scopeAllStations?: boolean,
 *   onRowClick?: (row: Record<string, unknown>) => void,
 * }} props
 */
export default function TrackMomentumChart({
    data,
    width,
    loading,
    error,
    scopeAllStations = true,
    onRowClick,
}) {
    const svgRef = useRef(null);
    const height = MOMENTUM_CHART_HEIGHT;

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
                .text('No momentum data in this window');
            return;
        }

        const sliced = data.slice(0, CHART_LINE_CAP);
        const colors = d3.schemeTableau10;

        const series = sliced.map((row, i) => {
            const daily = Array.isArray(row.daily_plays) ? row.daily_plays : [];
            return {
                label: trackLabel(row),
                color: colors[i % colors.length],
                points: daily
                    .map((d) => ({
                        date: parsePlayDate(d.play_date),
                        count: Number(d.play_count) || 0,
                    }))
                    .sort((a, b) => a.date - b.date),
                raw: row,
            };
        });

        const allDates = series.flatMap((s) => s.points.map((p) => p.date));
        const allCounts = series.flatMap((s) => s.points.map((p) => p.count));

        const margin = { top: 36, right: 12, bottom: 52, left: 52 };
        const legendW = Math.min(200, Math.floor(w * 0.36));
        const chartW = w - margin.left - margin.right - legendW - 8;
        const innerH = height - margin.top - margin.bottom;

        const extent = d3.extent(allDates);
        const xDomain =
            extent[0] != null && extent[1] != null ? extent : [new Date(), new Date()];
        const x = d3.scaleTime().domain(xDomain).range([0, chartW]);

        const maxY = d3.max(allCounts, (c) => c) || 1;
        const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerH, 0]);

        const line = d3
            .line()
            .x((d) => x(/** @type {{ date: Date }} */ (d).date))
            .y((d) => y(/** @type {{ count: number }} */ (d).count))
            .curve(d3.curveMonotoneX);

        const g = svg
            .attr('width', w)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('text')
            .attr('x', chartW / 2)
            .attr('y', -14)
            .attr('text-anchor', 'middle')
            .attr('font-size', '13px')
            .attr('font-weight', 600)
            .attr('fill', '#334155')
            .text('Daily plays (momentum leaders)');

        const plot = g.append('g');

        plot
            .append('g')
            .attr('transform', `translate(0,${innerH})`)
            .call(
                d3
                    .axisBottom(x)
                    .ticks(Math.min(8, allDates.length || 8))
                    .tickFormat(d3.timeFormat('%b %d')),
            )
            .call((sel) => sel.selectAll('text').attr('transform', 'rotate(-32)').style('text-anchor', 'end'));

        plot.append('g').call(d3.axisLeft(y).ticks(6));

        series.forEach((s) => {
            const pathData = line(s.points);
            if (!pathData) {
                return;
            }
            plot
                .append('path')
                .attr('fill', 'none')
                .attr('stroke', 'transparent')
                .attr('stroke-width', 12)
                .attr('d', pathData)
                .style('cursor', onRowClick ? 'pointer' : 'default')
                .on('click', (event) => {
                    event.stopPropagation();
                    if (onRowClick) {
                        onRowClick(/** @type {Record<string, unknown>} */ (s.raw));
                    }
                });

            plot
                .append('path')
                .attr('fill', 'none')
                .attr('stroke', s.color)
                .attr('stroke-width', 2)
                .attr('d', pathData)
                .style('pointer-events', 'none');
        });

        const leg = g
            .append('g')
            .attr('transform', `translate(${chartW + 14}, 0)`);

        leg.append('text')
            .attr('x', 0)
            .attr('y', -2)
            .attr('font-size', '11px')
            .attr('font-weight', 600)
            .attr('fill', '#64748b')
            .text('Tracks (click)');

        series.forEach((s, i) => {
            const rowG = leg
                .append('g')
                .attr('transform', `translate(0,${10 + i * 18})`)
                .style('cursor', onRowClick ? 'pointer' : 'default')
                .on('click', (event) => {
                    event.stopPropagation();
                    if (onRowClick) {
                        onRowClick(/** @type {Record<string, unknown>} */ (s.raw));
                    }
                });

            rowG.append('rect').attr('width', 10).attr('height', 3).attr('y', 4).attr('fill', s.color);

            const truncated =
                s.label.length > 34 ? `${s.label.slice(0, 33)}…` : s.label;
            rowG
                .append('text')
                .attr('x', 14)
                .attr('y', 8)
                .attr('font-size', '10px')
                .attr('fill', '#334155')
                .text(truncated);

            rowG.append('title').text(s.label);
        });
    }, [data, width, height, loading, error, onRowClick]);

    const scopeHint = scopeAllStations
        ? 'Across all stations · sum of positive day-over-day play changes (calendar days, zero-filled)'
        : 'On this station · sum of positive day-over-day play changes (calendar days, zero-filled)';

    const title = scopeAllStations
        ? 'Track momentum (day-over-day growth) — all stations'
        : 'Track momentum (day-over-day growth) — this station';

    return (
        <div style={{ width: '100%' }}>
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem', color: '#64748b' }}>{title}</h2>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>{scopeHint}</p>
            {onRowClick && (
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    Click a line or legend entry for track detail. Showing up to {CHART_LINE_CAP} tracks by
                    momentum score.
                </p>
            )}
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
