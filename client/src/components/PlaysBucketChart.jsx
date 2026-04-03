import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

/** Match {@link PlaysByDayChart} height for visual consistency. */
const PLAYS_BUCKET_CHART_HEIGHT = 300;
const PLAYS_BUCKET_CHART_HEIGHT_COMPACT = 132;

const PRIMARY_STROKE = '#6366f1';
const COMPARE_STROKE = '#0d9488';

/**
 * @param {unknown} raw
 */
function parseBucketTime(raw) {
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
 * @param {number} resolutionMinutes
 */
function pickTickFormat(resolutionMinutes) {
    if (resolutionMinutes >= 1440) {
        return d3.timeFormat('%b %d');
    }
    return d3.timeFormat('%b %d %H:%M');
}

/**
 * @param {unknown[] | null | undefined} primaryRows
 * @param {unknown[] | null | undefined} compareRows
 */
function mergeTwoSeries(primaryRows, compareRows) {
    const map = new Map();
    for (const row of primaryRows ?? []) {
        const r = /** @type {{ bucket_start?: unknown, play_count?: unknown }} */ (row);
        const date = parseBucketTime(r.bucket_start);
        const t = date.getTime();
        if (!map.has(t)) {
            map.set(t, { date, primary: 0, compare: 0 });
        }
        map.get(t).primary = Number(r.play_count) || 0;
    }
    for (const row of compareRows ?? []) {
        const r = /** @type {{ bucket_start?: unknown, play_count?: unknown }} */ (row);
        const date = parseBucketTime(r.bucket_start);
        const t = date.getTime();
        if (!map.has(t)) {
            map.set(t, { date, primary: 0, compare: 0 });
        }
        map.get(t).compare = Number(r.play_count) || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.date - b.date);
}

/**
 * @param {{
 *   data: unknown[] | null,
 *   compareData?: unknown[] | null,
 *   primarySeriesLabel?: string,
 *   compareSeriesLabel?: string,
 *   width: number,
 *   loading: boolean,
 *   error: Error | null,
 *   resolutionMinutes: number,
 *   chartTitle: string,
 *   compact?: boolean,
 *   height?: number,
 *   emptyMessage?: string,
 * }} props
 */
export default function PlaysBucketChart({
    data,
    compareData,
    primarySeriesLabel = 'This station',
    compareSeriesLabel = 'All stations',
    width,
    loading,
    error,
    resolutionMinutes,
    chartTitle,
    compact = false,
    height: heightProp,
    emptyMessage,
}) {
    const svgRef = useRef(null);
    const height =
        heightProp ??
        (compact ? PLAYS_BUCKET_CHART_HEIGHT_COMPACT : PLAYS_BUCKET_CHART_HEIGHT);
    const emptyText =
        emptyMessage ??
        (compact ? 'No plays in window' : 'No plays in this window for this selection');

    useEffect(() => {
        if (!svgRef.current || loading || error) {
            return;
        }
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const w = Math.max(width, compact ? 200 : 280);
        const hasCompare = compareData != null;
        const merged = hasCompare
            ? mergeTwoSeries(data, compareData)
            : (data ?? []).map((d) => ({
                  date: parseBucketTime(/** @type {{ bucket_start?: unknown }} */ (d).bucket_start),
                  count: Number(/** @type {{ play_count?: unknown }} */ (d).play_count) || 0,
              }));

        if (!merged.length) {
            svg
                .attr('width', w)
                .attr('height', height)
                .append('text')
                .attr('x', w / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .attr('fill', '#64748b')
                .attr('font-size', compact ? '11px' : '12px')
                .text(emptyText);
            return;
        }

        const parsed = merged.sort((a, b) => a.date - b.date);

        const marginTop = compact ? (chartTitle ? 20 : 6) : chartTitle ? 36 : 28;
        const margin = compact
            ? {
                  top: marginTop,
                  right: hasCompare ? 34 : 6,
                  bottom: 26,
                  left: hasCompare ? 36 : 30,
              }
            : {
                  top: marginTop,
                  right: hasCompare ? 52 : 20,
                  bottom: 48,
                  left: 56,
              };
        const innerW = w - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const x = d3
            .scaleTime()
            .domain(d3.extent(parsed, (d) => d.date))
            .range([0, innerW]);

        const primaryStroke = PRIMARY_STROKE;
        const compareStroke = COMPARE_STROKE;

        const maxPrimaryRaw = hasCompare
            ? d3.max(parsed, (d) => d.primary) ?? 0
            : d3.max(parsed, (d) => d.count) ?? 0;
        const maxPrimary = Math.max(maxPrimaryRaw, 1);

        const y = d3.scaleLinear().domain([0, maxPrimary]).nice().range([innerH, 0]);

        const maxCompareRaw = hasCompare ? (d3.max(parsed, (d) => d.compare) ?? 0) : 0;
        const maxCompare = Math.max(maxCompareRaw, 1);
        const yRight = hasCompare
            ? d3.scaleLinear().domain([0, maxCompare]).nice().range([innerH, 0])
            : null;

        const primaryPoints = hasCompare
            ? parsed.map((d) => ({ date: d.date, count: d.primary }))
            : parsed;

        const areaPrimary = d3
            .area()
            .x((d) => x(d.date))
            .y0(innerH)
            .y1((d) => y(d.count));

        const linePrimary = d3
            .line()
            .x((d) => x(d.date))
            .y((d) => y(d.count));

        const g = svg
            .attr('width', w)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        g.append('path')
            .datum(primaryPoints)
            .attr('fill', 'rgba(99, 102, 241, 0.12)')
            .attr('d', areaPrimary);

        g.append('path')
            .datum(primaryPoints)
            .attr('fill', 'none')
            .attr('stroke', primaryStroke)
            .attr('stroke-width', compact ? 1.5 : 2)
            .attr('d', linePrimary);

        if (hasCompare) {
            const comparePoints = parsed.map((d) => ({ date: d.date, count: d.compare }));

            const lineCompare = d3
                .line()
                .x((d) => x(d.date))
                .y((d) => yRight(d.count));

            g.append('path')
                .datum(comparePoints)
                .attr('fill', 'none')
                .attr('stroke', compareStroke)
                .attr('stroke-width', compact ? 1.5 : 2)
                .attr('d', lineCompare);
        }

        const tickFormat = pickTickFormat(resolutionMinutes);
        const maxTicks = compact
            ? Math.min(5, Math.max(3, parsed.length))
            : Math.min(12, Math.max(4, parsed.length));

        const xAxis = g
            .append('g')
            .attr('transform', `translate(0,${innerH})`)
            .call(d3.axisBottom(x).ticks(maxTicks).tickFormat(tickFormat));
        if (compact) {
            xAxis.selectAll('text').attr('font-size', '9px');
        } else {
            xAxis
                .selectAll('text')
                .attr('transform', 'rotate(-35)')
                .style('text-anchor', 'end');
        }

        const yTicks = compact ? 4 : 6;
        const yAxisLeft = g.append('g').call(d3.axisLeft(y).ticks(yTicks));
        if (compact) {
            yAxisLeft.selectAll('text').attr('font-size', '9px');
        }
        if (hasCompare) {
            yAxisLeft.selectAll('text').attr('fill', primaryStroke);
            yAxisLeft.selectAll('path, line').attr('stroke', primaryStroke);

            const yAxisRight = g
                .append('g')
                .attr('transform', `translate(${innerW},0)`)
                .call(d3.axisRight(yRight).ticks(yTicks));
            if (compact) {
                yAxisRight.selectAll('text').attr('font-size', '9px');
            }
            yAxisRight.selectAll('text').attr('fill', compareStroke);
            yAxisRight.selectAll('path, line').attr('stroke', compareStroke);
        }

        if (chartTitle) {
            g.append('text')
                .attr('x', innerW / 2)
                .attr('y', compact ? -4 : -10)
                .attr('text-anchor', 'middle')
                .attr('font-size', compact ? '11px' : '13px')
                .attr('font-weight', 600)
                .attr('fill', '#334155')
                .text(chartTitle);
        }
    }, [data, compareData, width, height, loading, error, resolutionMinutes, chartTitle, compact, emptyText]);

    const showCompareLegend = compareData != null && !loading && !error;

    const legendItemStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontSize: compact ? '0.72rem' : '0.8rem',
        color: '#475569',
        lineHeight: 1.2,
    };

    return (
        <div style={{ width: '100%' }}>
            {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
            {error && (
                <p style={{ color: '#b91c1c' }}>
                    {error.status === 503
                        ? 'MySQL is not configured or stats are unavailable.'
                        : error.message}
                </p>
            )}
            {!loading && !error && (
                <>
                    <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%' }} />
                    {showCompareLegend && (
                        <div
                            role="group"
                            aria-label="Chart legend"
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                columnGap: '1.1rem',
                                rowGap: '0.35rem',
                                marginTop: compact ? '0.45rem' : '0.6rem',
                                paddingTop: compact ? '0.35rem' : '0.45rem',
                                borderTop: '1px solid #e2e8f0',
                            }}
                        >
                            <span style={legendItemStyle}>
                                <span
                                    style={{
                                        display: 'inline-block',
                                        width: '1.1rem',
                                        height: '3px',
                                        borderRadius: '1px',
                                        background: PRIMARY_STROKE,
                                        flexShrink: 0,
                                    }}
                                    aria-hidden
                                />
                                {primarySeriesLabel}
                            </span>
                            <span style={legendItemStyle}>
                                <span
                                    style={{
                                        display: 'inline-block',
                                        width: '1.1rem',
                                        height: '3px',
                                        borderRadius: '1px',
                                        background: COMPARE_STROKE,
                                        flexShrink: 0,
                                    }}
                                    aria-hidden
                                />
                                {compareSeriesLabel}
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
