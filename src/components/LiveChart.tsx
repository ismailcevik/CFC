import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts } from 'echarts/core'
import { useEffect, useMemo, useRef } from 'react'
import { formatValue } from '../engine'
import { useRuntime } from '../runtime'
import type { AppNode, Sample } from '../types'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const WINDOW_SEC = 20

type LiveChartProps = {
  nodes: AppNode[]
  watched: string[]
  onUnwatch: (id: string) => void
  onHide: () => void
}

type SeriesLine = {
  id: string
  label: string
  color: string
  points: Sample[]
}

export function LiveChart({ nodes, watched, onUnwatch, onHide }: LiveChartProps) {
  const runtime = useRuntime()
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const lastPaint = useRef(0)
  const watchedNodes = watched
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is AppNode => node != null && node.type !== 'note')
  const hasSeries = watchedNodes.length > 0

  const lines = useMemo(
    () => collectLines(watchedNodes, runtime.series, runtime.values, runtime.t),
    [watchedNodes, runtime.series, runtime.values, runtime.t],
  )

  useEffect(() => {
    if (!hasSeries) return
    const host = hostRef.current
    if (!host) return
    const chart = echarts.init(host, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    lastPaint.current = 0
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(host)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [hasSeries])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || lines.length === 0) return
    const now = performance.now()
    if (lastPaint.current && now - lastPaint.current < 80) return
    lastPaint.current = now
    chart.setOption(toOption(lines, runtime.t), { notMerge: true, lazyUpdate: true })
  }, [lines, runtime.t])

  return (
    <section className="chart-panel">
      <div className="chart-head">
        <div>
          <h2>Canlı izleme</h2>
          <p>
            Trend · otomatik skala · {runtime.t.toFixed(1)} s · {runtime.running ? 'akıyor' : 'durdu'}
          </p>
        </div>
        <div className="chart-head-actions">
          <ul className="legend">
            {watchedNodes.map((node) => (
              <li key={node.id}>
                <button type="button" className="legend-item" onClick={() => onUnwatch(node.id)}>
                  <i style={{ background: node.data.color }} />
                  {node.data.label}
                  <span>{formatValue(runtime.values[node.id])}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="ghost compact" onClick={onHide}>
            Gizle
          </button>
        </div>
      </div>
      {watchedNodes.length === 0 ? (
        <p className="chart-empty">Trend için bir blok seçin veya panel açıkken bloğa tıklayın.</p>
      ) : (
        <div ref={hostRef} className="chart-host" role="img" aria-label="Seçilen çıkış trendi" />
      )}
    </section>
  )
}

function collectLines(
  nodes: AppNode[],
  series: Record<string, Sample[]>,
  values: Record<string, number | null>,
  now: number,
): SeriesLine[] {
  return nodes.flatMap((node) => {
    const stored = series[node.id]
    if (stored?.length) {
      return [{ id: node.id, label: node.data.label, color: node.data.color, points: stored }]
    }
    const value = values[node.id]
    if (value == null) return []
    return [
      {
        id: node.id,
        label: node.data.label,
        color: node.data.color,
        points: [
          { t: Math.max(0, now - WINDOW_SEC), v: value },
          { t: now, v: value },
        ],
      },
    ]
  })
}

function niceScale(rawMin: number, rawMax: number) {
  let min = rawMin
  let max = rawMax
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 1
  }
  if (min === max) {
    const pad = Math.max(0.1, Math.abs(min) * 0.1 || 0.1)
    min -= pad
    max += pad
  }
  const span = max - min
  min -= span * 0.08
  max += span * 0.08
  const rough = (max - min) / 5
  const mag = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-9)))
  const residual = rough / mag
  const step = residual >= 5 ? 5 * mag : residual >= 2 ? 2 * mag : mag
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  return { min: niceMin, max: niceMax, step }
}

function toOption(lines: SeriesLine[], now: number) {
  const from = Math.max(0, now - WINDOW_SEC)
  const to = Math.max(from + WINDOW_SEC, now)
  const visible = lines.flatMap((line) => line.points.filter((point) => point.t >= from))
  const values = visible.map((point) => point.v)
  const scale = niceScale(values.length ? Math.min(...values) : 0, values.length ? Math.max(...values) : 1)

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Segoe UI, Helvetica Neue, sans-serif' },
    grid: { left: 52, right: 16, top: 12, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        snap: true,
        lineStyle: { color: '#94a3b8', width: 1 },
        crossStyle: { color: '#94a3b8' },
      },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#d5dbe3',
      borderWidth: 1,
      extraCssText: 'box-shadow: 0 8px 24px rgba(28,36,48,0.10); padding: 8px 10px;',
      textStyle: { color: '#1c2430', fontSize: 12 },
      valueFormatter: (value: unknown) => formatValue(typeof value === 'number' ? value : null),
    },
    xAxis: {
      type: 'value',
      min: from,
      max: to,
      axisLine: { lineStyle: { color: '#c5ced6' } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: '#6b7280',
        fontSize: 10,
        formatter: (value: number) => `${value.toFixed(0)} s`,
      },
    },
    yAxis: {
      type: 'value',
      min: scale.min,
      max: scale.max,
      interval: scale.step,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#e6ebf0', type: 'dashed' } },
      axisLabel: { color: '#6b7280', fontSize: 10, formatter: formatTick },
    },
    series: lines.map((line) => ({
      id: line.id,
      name: line.label,
      type: 'line',
      showSymbol: false,
      symbol: 'none',
      sampling: 'lttb',
      clip: true,
      lineStyle: { width: 2, color: line.color },
      itemStyle: { color: line.color },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: hexAlpha(line.color, 0.22) },
          { offset: 1, color: hexAlpha(line.color, 0.02) },
        ]),
      },
      data: line.points.filter((point) => point.t >= from).map((point) => [point.t, point.v]),
    })),
  }
}

function hexAlpha(color: string, alpha: number) {
  if (!color.startsWith('#') || (color.length !== 7 && color.length !== 4)) {
    return color
  }
  const hex =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 100) return value.toFixed(0)
  if (abs >= 10) return value.toFixed(1)
  if (abs >= 1) return value.toFixed(2)
  return value.toFixed(3)
}
