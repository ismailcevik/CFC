import { clampInputCount } from './blocks'
import { PORT, boolInPort } from './ports'
import type { AppEdge, AppNode, NodeRuntime, Sample, SignalKind } from './types'
import { HISTORY_SEC, SAMPLE_DT } from './types'

export function generateSample(
  kind: SignalKind,
  t: number,
  amplitude: number,
  frequency: number,
  previous = 0,
): number {
  const phase = 2 * Math.PI * frequency * t
  if (kind === 'sine') return amplitude * Math.sin(phase)
  if (kind === 'noisySine') {
    return amplitude * Math.sin(phase) + amplitude * 0.28 * (Math.random() * 2 - 1)
  }
  if (kind === 'square') return amplitude * (Math.sin(phase) >= 0 ? 1 : -1)
  if (kind === 'saw') {
    const cycle = frequency * t
    return amplitude * (2 * (cycle - Math.floor(cycle + 0.5)))
  }
  return previous + (Math.random() - 0.5) * amplitude * 0.22
}

export function movingAverage(
  series: Sample[],
  now: number,
  windowSec: number,
  delaySec = 0,
): number | null {
  if (windowSec <= 0 || series.length === 0) return null
  const { from, to } = maBounds(now, windowSec, delaySec)
  let sum = 0
  let count = 0
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const point = series[i]
    if (point.t > to) continue
    if (point.t < from) break
    sum += point.v
    count += 1
  }
  if (count === 0) return null
  return sum / count
}

export function windowCount(series: Sample[], now: number, windowSec: number, delaySec = 0): number {
  const { from, to } = maBounds(now, windowSec, delaySec)
  let count = 0
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const point = series[i]
    if (point.t > to) continue
    if (point.t < from) break
    count += 1
  }
  return count
}

export function maBounds(now: number, windowSec: number, delaySec = 0) {
  const delay = Math.max(0, delaySec)
  const to = now - delay
  return { from: to - windowSec, to, delay }
}

function incoming(edges: AppEdge[], nodeId: string, handle: string): AppEdge | undefined {
  return edges.find((edge) => edge.target === nodeId && edge.targetHandle === handle)
}

function read(values: Record<string, number | null>, edges: AppEdge[], nodeId: string, handle: string): number | null {
  const edge = incoming(edges, nodeId, handle)
  if (!edge) return null
  return values[edge.source] ?? null
}

function asBool(value: number | null): boolean {
  return value != null && value !== 0
}

function topologicalOrder(nodes: AppNode[], edges: AppEdge[]): string[] {
  const ids = nodes.map((node) => node.id)
  const indegree = new Map(ids.map((id) => [id, 0]))
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]))

  for (const edge of edges) {
    if (!indegree.has(edge.target) || !adjacency.has(edge.source)) continue
    adjacency.get(edge.source)?.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const queue = ids.filter((id) => indegree.get(id) === 0)
  const ordered: string[] = []

  while (queue.length > 0) {
    const id = queue.shift()
    if (!id) break
    ordered.push(id)
    for (const next of adjacency.get(id) ?? []) {
      const nextDegree = (indegree.get(next) ?? 1) - 1
      indegree.set(next, nextDegree)
      if (nextDegree === 0) queue.push(next)
    }
  }

  return ordered.length === ids.length ? ordered : ids
}

function appendSample(series: Sample[] | undefined, sample: Sample, now: number): Sample[] {
  const next = series ? [...series, sample] : [sample]
  const from = now - HISTORY_SEC
  const start = next.findIndex((point) => point.t >= from)
  return start <= 0 ? next : next.slice(start)
}

function emit(
  values: Record<string, number | null>,
  series: Record<string, Sample[]>,
  id: string,
  t: number,
  value: number | null,
) {
  values[id] = value
  if (value != null) series[id] = appendSample(series[id], { t, v: value }, t)
}

function evalNode(
  node: AppNode,
  edges: AppEdge[],
  values: Record<string, number | null>,
  series: Record<string, Sample[]>,
  state: Record<string, NodeRuntime>,
  t: number,
  dt: number,
) {
  const id = node.id
  const data = node.data
  const st = state[id] ?? (state[id] = {})
  const a = (handle: string) => read(values, edges, id, handle)
  const b = (handle: string) => asBool(a(handle))

  if (node.type === 'signal') {
    emit(values, series, id, t, generateSample(data.signalKind, t, data.amplitude, data.frequency, series[id]?.at(-1)?.v ?? 0))
    return
  }
  if (node.type === 'time') {
    values[id] = data.windowSec
    return
  }
  if (node.type === 'digital') {
    const q =
      data.digitalMode === 'on' ? 1 : data.digitalMode === 'off' ? 0 : Math.sin(2 * Math.PI * data.frequency * t) >= 0 ? 1 : 0
    emit(values, series, id, t, q)
    return
  }
  if (node.type === 'and' || node.type === 'or' || node.type === 'xor') {
    if (incoming(edges, id, PORT.boolIn) == null || incoming(edges, id, PORT.boolIn2) == null) {
      values[id] = null
      return
    }
    const x = b(PORT.boolIn)
    const y = b(PORT.boolIn2)
    const q = node.type === 'and' ? x && y : node.type === 'or' ? x || y : x !== y
    emit(values, series, id, t, q ? 1 : 0)
    return
  }
  if (node.type === 'not') {
    if (incoming(edges, id, PORT.boolIn) == null) {
      values[id] = null
      return
    }
    emit(values, series, id, t, b(PORT.boolIn) ? 0 : 1)
    return
  }
  if (node.type === 'rs') {
    const set = b(PORT.boolIn)
    const reset = b(PORT.boolIn2)
    if (reset) st.q = false
    else if (set) st.q = true
    emit(values, series, id, t, st.q ? 1 : 0)
    return
  }
  if (node.type === 'gt' || node.type === 'lt' || node.type === 'eq') {
    const x = a(PORT.signalIn)
    const y = a(PORT.signalIn2)
    if (x == null || y == null) {
      values[id] = null
      return
    }
    const q = node.type === 'gt' ? x > y : node.type === 'lt' ? x < y : Math.abs(x - y) < 1e-3
    emit(values, series, id, t, q ? 1 : 0)
    return
  }
  if (node.type === 'hys') {
    const x = a(PORT.signalIn)
    if (x == null) {
      values[id] = null
      return
    }
    if (x >= data.hysHigh) st.q = true
    else if (x <= data.hysLow) st.q = false
    emit(values, series, id, t, st.q ? 1 : 0)
    return
  }
  if (node.type === 'add' || node.type === 'sub' || node.type === 'mul' || node.type === 'div') {
    const x = a(PORT.signalIn)
    const y = a(PORT.signalIn2)
    if (x == null || y == null) {
      values[id] = null
      return
    }
    if (node.type === 'div' && y === 0) {
      values[id] = null
      return
    }
    const value = node.type === 'add' ? x + y : node.type === 'sub' ? x - y : node.type === 'mul' ? x * y : x / y
    emit(values, series, id, t, value)
    return
  }
  if (node.type === 'limit') {
    const x = a(PORT.signalIn)
    if (x == null) {
      values[id] = null
      return
    }
    emit(values, series, id, t, Math.min(data.limitMax, Math.max(data.limitMin, x)))
    return
  }
  if (node.type === 'ton' || node.type === 'tof') {
    const inn = incoming(edges, id, PORT.boolIn) != null && b(PORT.boolIn)
    const pt = a(PORT.timeIn) ?? data.windowSec
    if (node.type === 'ton') {
      if (!inn) {
        st.acc = 0
        st.q = false
      } else {
        st.acc = (st.acc ?? 0) + dt
        st.q = (st.acc ?? 0) >= pt
      }
    } else if (inn) {
      st.acc = pt
      st.q = true
    } else if (st.q) {
      st.acc = Math.max(0, (st.acc ?? 0) - dt)
      st.q = (st.acc ?? 0) > 0
    }
    emit(values, series, id, t, st.q ? 1 : 0)
    return
  }
  if (node.type === 'ctu') {
    const cu = b(PORT.boolIn)
    const reset = b(PORT.boolIn2)
    if (reset) st.count = 0
    else if (cu && !st.lastIn) st.count = (st.count ?? 0) + 1
    st.lastIn = cu
    st.q = (st.count ?? 0) >= data.preset
    emit(values, series, id, t, st.q ? 1 : 0)
    return
  }
  if (node.type === 'ma') {
    const src = incoming(edges, id, PORT.signalIn)
    const windowSec = a(PORT.timeIn)
    const delaySec = a(PORT.timeIn2) ?? data.delaySec
    if (!src || windowSec == null) {
      values[id] = null
      return
    }
    emit(values, series, id, t, movingAverage(series[src.source] ?? [], t, windowSec, delaySec))
    return
  }
  if (node.type === 'pt1') {
    const x = a(PORT.signalIn)
    const tau = a(PORT.timeIn) ?? data.windowSec
    if (x == null || tau <= 0) {
      values[id] = null
      return
    }
    st.y = (st.y ?? x) + (dt / tau) * (x - (st.y ?? x))
    emit(values, series, id, t, st.y)
    return
  }
  if (node.type === 'pid') {
    const pv = a(PORT.signalIn)
    const sp = a(PORT.signalIn2)
    if (pv == null || sp == null) {
      values[id] = null
      return
    }
    const err = sp - pv
    if (data.ti > 0) st.integral = (st.integral ?? 0) + (data.kp / data.ti) * err * dt
    const deriv = data.td > 0 ? (data.td * (err - (st.lastErr ?? err))) / dt : 0
    st.lastErr = err
    const raw = data.kp * err + (st.integral ?? 0) + deriv
    emit(values, series, id, t, Math.min(data.limitMax, Math.max(data.limitMin, raw)))
    return
  }
  if (node.type === 'ramp') {
    const target = a(PORT.signalIn)
    const tm = a(PORT.timeIn) ?? data.rampSec
    if (target == null || tm <= 0) {
      values[id] = null
      return
    }
    const rate = 1 / tm
    const cur = st.y ?? target
    const delta = target - cur
    const step = Math.sign(delta) * Math.min(Math.abs(delta), rate * dt)
    st.y = cur + step
    emit(values, series, id, t, st.y)
    return
  }
  if (node.type === 'sel') {
    const in0 = a(PORT.signalIn)
    const in1 = a(PORT.signalIn2)
    const pick = b(PORT.boolIn) ? in1 : in0
    if (pick == null) {
      values[id] = null
      return
    }
    emit(values, series, id, t, pick)
    return
  }
  if (node.type === 'interlock') {
    const pins = Array.from({ length: clampInputCount(data.inputCount) }, (_, index) => boolInPort(index))
    const used = pins.filter((handle) => incoming(edges, id, handle) != null)
    if (used.length === 0) {
      values[id] = null
      return
    }
    emit(values, series, id, t, used.every((handle) => b(handle)) ? 1 : 0)
    return
  }
  if (node.type === 'note') return
  if (node.type === 'display') {
    emit(values, series, id, t, a(PORT.signalIn))
  }
}

export function stepSimulation(
  nodes: AppNode[],
  edges: AppEdge[],
  series: Record<string, Sample[]>,
  t: number,
  state: Record<string, NodeRuntime>,
  dt = SAMPLE_DT,
): { values: Record<string, number | null>; series: Record<string, Sample[]> } {
  const values: Record<string, number | null> = {}
  const nextSeries: Record<string, Sample[]> = { ...series }
  const byId = new Map(nodes.map((node) => [node.id, node]))

  for (const id of topologicalOrder(nodes, edges)) {
    const node = byId.get(id)
    if (node) evalNode(node, edges, values, nextSeries, state, t, dt)
  }

  return { values, series: nextSeries }
}

export function maWindowInfo(
  nodes: { id: string; data: { windowSec: number; delaySec?: number } }[],
  edges: { source: string; target: string; targetHandle?: string | null }[],
  series: Record<string, Sample[]>,
  t: number,
  maId: string,
) {
  const maNode = nodes.find((node) => node.id === maId)
  const timeEdge = edges.find((edge) => edge.target === maId && edge.targetHandle === PORT.timeIn)
  const delayEdge = edges.find((edge) => edge.target === maId && edge.targetHandle === PORT.timeIn2)
  const signalEdge = edges.find((edge) => edge.target === maId && edge.targetHandle === PORT.signalIn)
  const timeNode = nodes.find((node) => node.id === timeEdge?.source)
  const delayNode = nodes.find((node) => node.id === delayEdge?.source)
  const windowSec = timeNode?.data.windowSec ?? 10
  const delaySec = delayNode?.data.windowSec ?? maNode?.data.delaySec ?? 0
  const bounds = maBounds(t, windowSec, delaySec)
  const count = signalEdge ? windowCount(series[signalEdge.source] ?? [], t, windowSec, delaySec) : 0
  return {
    windowSec,
    delaySec,
    count,
    from: bounds.from,
    to: bounds.to,
    ready: Boolean(timeEdge && signalEdge),
  }
}

export function formatValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (Math.abs(value - Math.round(value)) < 1e-6 && Math.abs(value) < 1e6) return String(Math.round(value))
  return value.toFixed(3)
}
