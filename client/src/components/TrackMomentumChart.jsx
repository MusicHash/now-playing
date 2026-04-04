import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

import { MOMENTUM_DIRECTION_DOWN, MOMENTUM_DIRECTION_UP } from '../lib/statsApi.js';

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
 * @param {'track' | 'artist'} entityType
 */
function seriesLabel(row, entityType) {
    if (entityType === 'artist') {
        return String(row.log_artist ?? '').trim() || '(unknown)';
    }
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
 *   entityType?: 'track' | 'artist',
 *   showDirectionControl?: boolean,
 *   direction?: typeof MOMENTUM_DIRECTION_UP | typeof MOMENTUM_DIRECTION_DOWN,
 *   onDirectionChange?: (direction: typeof MOMENTUM_DIRECTION_UP | typeof MOMENTUM_DIRECTION_DOWN) => void,
 *   onRowClick?: (row: Record<string, unknown>) => void,
 * }} props
 */
export default function TrackMomentumChart({
    data,
    width,
    loading,
    error,
    scopeAllStations = true,
    entityType = 'track',
    showDirectionControl = true,
    direction = MOMENTUM_DIRECTION_UP,
    onDirectionChange,
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
            const emptyArtist = entityType === 'artist';
            const emptyDown = direction === MOMENTUM_DIRECTION_DOWN;
            const emptyMsg = emptyArtist
                ? emptyDown
                    ? 'No falling artists in this window'
                    : 'No rising artists in this window'
                : emptyDown
                  ? 'No falling tracks in this window'
                  : 'No rising tracks in this window';
            svg
                .attr('width', w)
                .attr('height', height)
                .append('text')
                .attr('x', w / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .attr('fill', '#64748b')
                .text(emptyMsg);
            return;
        }

        const sliced = data.slice(0, CHART_LINE_CAP);
        const colors = d3.schemeTableau10;

        const series = sliced.map((row, i) => {
            const daily = Array.isArray(row.daily_plays) ? row.daily_plays : [];
            return {
                label: seriesLabel(row, entityType),
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
            .text(
                entityType === 'artist'
                    ? direction === MOMENTUM_DIRECTION_DOWN
                        ? 'Daily plays (falling artists)'
                        : 'Daily plays (rising artists)'
                    : direction === MOMENTUM_DIRECTION_DOWN
                      ? 'Daily plays (falling tracks)'
                      : 'Daily plays (rising tracks)',
            );

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
            .text(entityType === 'artist' ? 'Artists (click)' : 'Tracks (click)');

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
    }, [data, width, height, loading, error, onRowClick, direction, entityType]);

    const rising = direction === MOMENTUM_DIRECTION_UP;
    const isArtist = entityType === 'artist';

    const scopeHint = scopeAllStations
        ? rising
            ? 'Across all stations · linear trend of daily plays over the selected window (largest positive slope first)'
            : 'Across all stations · same trend line; largest negative slopes first'
        : rising
          ? 'On this station · linear trend of daily plays over the selected window (largest positive slope first)'
          : 'On this station · same trend line; largest negative slopes first';

    const title = scopeAllStations
        ? rising
            ? isArtist
                ? 'Rising artists (daily trend) — all stations'
                : 'Rising tracks (daily trend) — all stations'
            : isArtist
              ? 'Falling artists (daily trend) — all stations'
              : 'Falling tracks (daily trend) — all stations'
        : rising
          ? isArtist
            ? 'Rising artists (daily trend) — this station'
            : 'Rising tracks (daily trend) — this station'
          : isArtist
            ? 'Falling artists (daily trend) — this station'
            : 'Falling tracks (daily trend) — this station';

    return (
        <div style={{ width: '100%' }}>
            {onDirectionChange && showDirectionControl && (
                <div style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 600 }}>Momentum</span>
                        <select
                            value={direction}
                            onChange={(e) => {
                                const v = e.target.value;
                                onDirectionChange(
                                    v === MOMENTUM_DIRECTION_DOWN ? MOMENTUM_DIRECTION_DOWN : MOMENTUM_DIRECTION_UP,
                                );
                            }}
                            style={{
                                fontSize: '0.8rem',
                                padding: '0.25rem 0.35rem',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                color: '#334155',
                                background: '#fff',
                            }}
                        >
                            <option value={MOMENTUM_DIRECTION_UP}>Going up (more plays recently)</option>
                            <option value={MOMENTUM_DIRECTION_DOWN}>Going down (fewer plays recently)</option>
                        </select>
                    </label>
                </div>
            )}
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem', color: '#64748b' }}>{title}</h2>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>{scopeHint}</p>
            {onRowClick && (
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    {isArtist
                        ? `Click a line or legend entry for artist detail. Showing up to ${CHART_LINE_CAP} artists with`
                        : `Click a line or legend entry for track detail. Showing up to ${CHART_LINE_CAP} tracks with`}
                    {' '}
                    the strongest {rising ? 'positive' : 'negative'} daily trend (linear fit over the chart
                    window).
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
