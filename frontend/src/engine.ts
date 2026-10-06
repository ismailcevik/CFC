import { clampInputCount, clampSampleWindow } from './blocks'
import { PORT, boolInPort, boolOutPort } from './ports'
import type { AppEdge, AppNode, NodeRuntime, Sample, SignalKind } from './types'
import { HISTORY_SEC, SAMPLE_DT } from './types'

export function generateSample(
  kind: SignalKind,
  t: number,
  amplitude: number,
  frequency: number,
  previous = 0,
  offset = 0,
): number {
  const phase = 2 * Math.PI * frequency * t
  const wave =
    kind === 'sine'
      ? amplitude * Math.sin(phase)
      : kind === 'noisySine'
        ? amplitude * Math.sin(phase) + amplitude * 0.28 * (Math.random() * 2 - 1)
        : kind === 'square'
          ? amplitude * (Math.sin(phase) >= 0 ? 1 : -1)
          : kind === 'saw'
            ? amplitude * (2 * (frequency * t - Math.floor(frequency * t + 0.5)))
            : previous - offset + (Math.random() - 0.5) * amplitude * 0.22
  return wave + offset
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

export function livePinValue(
  values: Record<string, number | null>,
  nodeId: string,
  handle?: string | null,
): number | null {
  if (handle) {
    const keyed = values[`${nodeId}:${handle}`]
    if (keyed !== undefined) return keyed
  }
  return values[nodeId] ?? null
}

/** Pin handle değeri yoksa blok ana çıkışına düşme (ör. TIME geri sayımı). */
export function livePinValueAtHandle(
  values: Record<string, number | null>,
  nodeId: string,
  handle: string,
): number | null {
  const keyed = values[`${nodeId}:${handle}`]
  return keyed !== undefined ? keyed : null
}

function pinValue(
  values: Record<string, number | null>,
  nodeId: string,
  handle?: string | null,
): number | null {
  return livePinValue(values, nodeId, handle)
}

function read(values: Record<string, number | null>, edges: AppEdge[], nodeId: string, handle: string): number | null {
  const edge = incoming(edges, nodeId, handle)
  if (!edge) return null
  return pinValue(values, edge.source, edge.sourceHandle)
}

function readWiredSignal(
  values: Record<string, number | null>,
  nodes: WiredNode[],
  edges: AppEdge[],
  nodeId: string,
  targetHandle: string,
): number | null {
  const edge = incoming(edges, nodeId, targetHandle)
  if (!edge) return null
  const resolved = resolveSignalSource(nodes, edge.source, edge.sourceHandle)
  return readNumericSource(values, resolved.sourceId, resolved.handle, resolved.src)
}

/** Fark / değişim: işaret yok, ≥ 0 */
function absChange(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null
  return Math.abs(value)
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
  nodes: AppNode[],
) {
  const id = node.id
  const data = node.data
  const st = state[id] ?? (state[id] = {})
  const a = (handle: string) => read(values, edges, id, handle)
  const b = (handle: string) => asBool(a(handle))

  if (node.type === 'signal') {
    emit(
      values,
      series,
      id,
      t,
      generateSample(
        data.signalKind,
        t,
        data.amplitude,
        data.frequency,
        series[id]?.at(-1)?.v ?? data.offset,
        data.offset,
      ),
    )
    return
  }
  if (node.type === 'const') {
    emit(values, series, id, t, data.amplitude)
    return
  }
  if (node.type === 'time') {
    const period = Math.max(0.1, data.windowSec)
    const hold = 1
    const inWired = incoming(edges, id, PORT.boolIn) != null
    const running = inWired && b(PORT.boolIn)
    if (st.acc == null) st.acc = period
    if (!running) {
      emit(values, series, id, t, Math.max(0, st.acc ?? 0))
      values[`${id}:${PORT.boolOut}`] = (st.lastErr ?? 0) > 0 ? 1 : 0
      values[`${id}:${PORT.signalOut}`] = period
      return
    }
    if ((st.lastErr ?? 0) > 0) {
      st.lastErr = (st.lastErr ?? 0) - dt
      if ((st.lastErr ?? 0) <= 0) {
        st.lastErr = 0
        st.acc = period
      }
      emit(values, series, id, t, 0)
      values[`${id}:${PORT.boolOut}`] = 1
      values[`${id}:${PORT.signalOut}`] = period
      return
    }
    st.acc = (st.acc ?? period) - dt
    if ((st.acc ?? 0) <= 0) {
      st.acc = 0
      st.lastErr = hold
    }
    emit(values, series, id, t, Math.max(0, st.acc ?? 0))
    values[`${id}:${PORT.boolOut}`] = (st.lastErr ?? 0) > 0 ? 1 : 0
    values[`${id}:${PORT.signalOut}`] = period
    return
  }
  if (node.type === 'digital') {
    const q =
      data.digitalMode === 'on' ? 1 : data.digitalMode === 'off' ? 0 : Math.sin(2 * Math.PI * data.frequency * t) >= 0 ? 1 : 0
    emit(values, series, id, t, q)
    return
  }
  if (node.type === 'and' || node.type === 'or' || node.type === 'xor') {
    const pins = Array.from({ length: clampInputCount(data.inputCount) }, (_, index) => boolInPort(index))
    const used = pins.filter((handle) => incoming(edges, id, handle) != null)
    if (used.length === 0) {
      values[id] = null
      return
    }
    const q =
      node.type === 'and'
        ? used.every((handle) => b(handle))
        : node.type === 'or'
          ? used.some((handle) => b(handle))
          : used.reduce((acc, handle) => acc !== b(handle), false)
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
    const mn =
      incoming(edges, id, PORT.signalIn2) != null ? a(PORT.signalIn2) : data.limitMin
    const mx =
      incoming(edges, id, PORT.signalIn3) != null ? a(PORT.signalIn3) : data.limitMax
    if (mn == null || mx == null) {
      values[id] = null
      return
    }
    emit(values, series, id, t, Math.min(mx, Math.max(mn, x)))
    return
  }
  if (node.type === 'norm') {
    if (incoming(edges, id, PORT.signalIn) == null) {
      values[id] = null
      return
    }
    const rawIn = a(PORT.signalIn)
    if (rawIn == null) {
      values[id] = null
      return
    }
    const altHedef = resolveWiredNumeric(values, nodes, edges, id, PORT.signalIn2, data.normAlt)
    const ustHedef = resolveWiredNumeric(values, nodes, edges, id, PORT.signalIn3, data.normUst)
    const lo = Math.min(altHedef, ustHedef)
    const hi = Math.max(altHedef, ustHedef)
    const span = hi - lo
    let out: number
    if (span < 1e-9) {
      out = 0
    } else {
      const t = (rawIn - lo) / span
      out = -5 + t * 10
    }
    emit(values, series, id, t, Math.min(5, Math.max(-5, out)))
    return
  }
  if (node.type === 'limitler') {
    const altLimit =
      incoming(edges, id, PORT.signalIn) != null ? a(PORT.signalIn) : data.limitMin
    const ustLimit =
      incoming(edges, id, PORT.signalIn2) != null ? a(PORT.signalIn2) : data.limitMax
    const altHedef =
      incoming(edges, id, PORT.signalIn3) != null ? a(PORT.signalIn3) : data.normAlt
    const ustHedef =
      incoming(edges, id, PORT.signalIn4) != null ? a(PORT.signalIn4) : data.normUst
    if (altLimit == null || ustLimit == null || altHedef == null || ustHedef == null) {
      values[id] = null
      values[`${id}:${PORT.signalOut}`] = null
      values[`${id}:${PORT.signalOut2}`] = null
      values[`${id}:${PORT.signalOut3}`] = null
      values[`${id}:${PORT.signalOut4}`] = null
      return
    }
    emit(values, series, id, t, altLimit)
    values[`${id}:${PORT.signalOut}`] = altLimit
    values[`${id}:${PORT.signalOut2}`] = ustLimit
    values[`${id}:${PORT.signalOut3}`] = altHedef
    values[`${id}:${PORT.signalOut4}`] = ustHedef
    series[`${id}:${PORT.signalOut}`] = appendSample(series[`${id}:${PORT.signalOut}`], { t, v: altLimit }, t)
    series[`${id}:${PORT.signalOut2}`] = appendSample(series[`${id}:${PORT.signalOut2}`], { t, v: ustLimit }, t)
    series[`${id}:${PORT.signalOut3}`] = appendSample(series[`${id}:${PORT.signalOut3}`], { t, v: altHedef }, t)
    series[`${id}:${PORT.signalOut4}`] = appendSample(series[`${id}:${PORT.signalOut4}`], { t, v: ustHedef }, t)
    return
  }
  if (node.type === 'tamSayi') {
    const x = a(PORT.signalIn)
    if (x == null) {
      values[id] = null
      return
    }
    const mode = data.tamSayiMode ?? 'round'
    const out =
      mode === 'trunc'
        ? Math.trunc(x)
        : mode === 'floor'
          ? Math.floor(x)
          : mode === 'ceil'
            ? Math.ceil(x)
            : Math.round(x)
    emit(values, series, id, t, out)
    return
  }
  if (node.type === 'degisim') {
    if (incoming(edges, id, PORT.signalIn) == null) {
      values[id] = null
      return
    }
    const x = readWiredSignal(values, nodes, edges, id, PORT.signalIn)
    if (x == null) {
      values[id] = null
      return
    }
    const prev = st.degisimPrevIn
    if (prev == null || !Number.isFinite(prev)) {
      st.degisimPrevIn = x
      emit(values, series, id, t, 0)
      values[`${id}:${PORT.signalOut}`] = 0
      return
    }
    const out = absChange(x - prev) ?? 0
    st.degisimPrevIn = x
    emit(values, series, id, t, out)
    values[`${id}:${PORT.signalOut}`] = out
    return
  }
  if (node.type === 'oluBant') {
    if (incoming(edges, id, PORT.signalIn) == null) {
      values[id] = null
      return
    }
    const x = readWiredSignal(values, nodes, edges, id, PORT.signalIn)
    if (x == null) {
      values[id] = null
      return
    }
    const usesNewPins = incoming(edges, id, PORT.signalIn3) != null
    const limitPin = usesNewPins ? PORT.signalIn3 : PORT.signalIn2
    const band = resolveWiredNumeric(values, nodes, edges, id, limitPin, data.amplitude)
    if (band == null || band < 0) {
      values[id] = null
      return
    }
    const lastOut = st.oluBantOut
    if (lastOut == null || !Number.isFinite(lastOut)) {
      st.oluBantOut = x
      emit(values, series, id, t, x)
      return
    }
    let delta: number | null = null
    if (usesNewPins && incoming(edges, id, PORT.signalIn2) != null) {
      delta = absChange(readWiredSignal(values, nodes, edges, id, PORT.signalIn2))
    }
    if (delta == null) delta = absChange(x - lastOut)
    if (delta == null) {
      values[id] = null
      return
    }
    values[`${id}:${PORT.signalIn2}`] = delta
    const out = band <= 0 || delta >= band ? x : lastOut
    st.oluBantOut = out
    emit(values, series, id, t, out)
    return
  }
  if (node.type === 'spikeFilt') {
    if (incoming(edges, id, PORT.signalIn) == null) {
      values[id] = null
      return
    }
    const x = readWiredSignal(values, nodes, edges, id, PORT.signalIn)
    if (x == null) {
      values[id] = null
      return
    }
    const usesNewPins = incoming(edges, id, PORT.signalIn3) != null
    const limitPin = usesNewPins ? PORT.signalIn3 : PORT.signalIn2
    const limit = resolveWiredNumeric(values, nodes, edges, id, limitPin, data.amplitude)
    if (limit == null || limit < 0) {
      values[id] = null
      return
    }
    const lastOut = st.spikeOut
    if (lastOut == null || !Number.isFinite(lastOut)) {
      st.spikeLastIn = x
      st.spikeOut = x
      emit(values, series, id, t, x)
      return
    }
    let delta: number | null = null
    if (usesNewPins && incoming(edges, id, PORT.signalIn2) != null) {
      delta = absChange(readWiredSignal(values, nodes, edges, id, PORT.signalIn2))
    }
    if (delta == null) {
      const prevIn = st.spikeLastIn
      if (prevIn != null && Number.isFinite(prevIn)) delta = absChange(x - prevIn)
    }
    if (delta == null) {
      values[id] = null
      return
    }
    values[`${id}:${PORT.signalIn2}`] = delta
    const out = limit <= 0 || delta <= limit ? x : lastOut
    st.spikeLastIn = x
    st.spikeOut = out
    emit(values, series, id, t, out)
    return
  }
  if (node.type === 'winMinMax') {
    const x = a(PORT.signalIn)
    if (x == null) {
      values[id] = null
      values[`${id}:${PORT.signalOut}`] = null
      values[`${id}:${PORT.signalOut2}`] = null
      return
    }
    const n = clampSampleWindow(data.preset)
    const buf = st.samples ? [...st.samples, x] : [x]
    if (buf.length > n) buf.splice(0, buf.length - n)
    st.samples = buf
    const mn = Math.min(...buf)
    const mx = Math.max(...buf)
    emit(values, series, id, t, mx)
    values[`${id}:${PORT.signalOut}`] = mx
    values[`${id}:${PORT.signalOut2}`] = mn
    series[`${id}:${PORT.signalOut2}`] = appendSample(series[`${id}:${PORT.signalOut2}`], { t, v: mn }, t)
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
    const windowSec = resolveWiredNumeric(values, nodes, edges, id, PORT.timeIn, data.windowSec)
    const delaySec = resolveWiredNumeric(values, nodes, edges, id, PORT.timeIn2, data.delaySec ?? 0)
    if (!src || windowSec == null || windowSec <= 0) {
      values[id] = null
      return
    }
    const history = series[src.source] ?? []
    const current = movingAverage(history, t, windowSec, 0)
    emit(values, series, id, t, current)
    values[`${id}:${PORT.signalOut}`] = current
    values[`${id}:${PORT.signalOut2}`] =
      delaySec > 0 ? movingAverage(history, t, windowSec, delaySec) : null
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
  if (node.type === 'boolRoute') {
    const n = clampInputCount(data.inputCount)
    values[id] = null
    for (let index = 0; index < n; index++) {
      const inn = boolInPort(index)
      const out = boolOutPort(index)
      const wired = incoming(edges, id, inn) != null
      const val = wired ? (b(inn) ? 1 : 0) : 0
      values[`${id}:${out}`] = val
      series[`${id}:${out}`] = appendSample(series[`${id}:${out}`], { t, v: val }, t)
    }
    return
  }
  if (node.type === 'note' || node.type === 'sheetIn' || node.type === 'sheetOut' || node.type === 'sheetLane' || node.type === 'hopPanel') return
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
  const workNodes = nodes.filter(
    (node) => node.type !== 'sheetIn' && node.type !== 'sheetOut' && node.type !== 'sheetLane' && node.type !== 'hopPanel',
  )
  const workIds = new Set(workNodes.map((node) => node.id))
  const workEdges = edges.filter((edge) => workIds.has(edge.source) && workIds.has(edge.target))
  const byId = new Map(workNodes.map((node) => [node.id, node]))

  for (const id of topologicalOrder(workNodes, workEdges)) {
    const node = byId.get(id)
    if (node) evalNode(node, workEdges, values, nextSeries, state, t, dt, workNodes)
  }

  return { values, series: nextSeries }
}

export function maWindowInfo(
  nodes: { id: string; data: { windowSec: number; delaySec?: number } }[],
  edges: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[],
  series: Record<string, Sample[]>,
  t: number,
  maId: string,
  values: Record<string, number | null> = {},
) {
  const maNode = nodes.find((node) => node.id === maId)
  const timeEdge = edges.find((edge) => edge.target === maId && edge.targetHandle === PORT.timeIn)
  edges.find((edge) => edge.target === maId && (edge.targetHandle ?? '') === PORT.timeIn2)
  const signalEdge = edges.find((edge) => edge.target === maId && edge.targetHandle === PORT.signalIn)
  const wiredNodes = nodes as Parameters<typeof resolveWiredNumeric>[1]
  const windowSec = maNode
    ? resolveWiredNumeric(values, wiredNodes, edges, maId, PORT.timeIn, maNode.data.windowSec)
    : 10
  const delaySec = maNode
    ? resolveWiredNumeric(values, wiredNodes, edges, maId, PORT.timeIn2, maNode.data.delaySec ?? 0)
    : 0
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
  const abs = Math.abs(value)
  if (abs > 0 && abs < 0.0001) return value.toFixed(6)
  if (abs > 0 && abs < 0.01) return value.toFixed(4)
  if (Math.abs(value - Math.round(value)) < 1e-6 && abs < 1e6) return String(Math.round(value))
  return value.toFixed(3)
}

export function formatPinValue(
  value: number | null | undefined,
  kind: 'signal' | 'time' | 'bool' | null | undefined,
): string {
  if (kind === 'time') return value == null || Number.isNaN(value) ? '—' : `${formatValue(value)} s`
  if (kind === 'bool') return value == null ? '—' : value ? '1' : '0'
  return formatValue(value)
}

type WiredNode = {
  id: string
  type?: string
  data: {
    windowSec: number
    amplitude: number
    delaySec?: number
    remoteNodeId?: string
    remoteHandle?: string
  }
}

function resolveSignalSource(
  nodes: WiredNode[],
  sourceId: string,
  sourceHandle?: string | null,
): { sourceId: string; handle?: string; src?: WiredNode } {
  let id = sourceId
  let handle = sourceHandle ?? undefined
  let src = nodes.find((item) => item.id === id)
  while (src?.type === 'sheetIn' && src.data.remoteNodeId) {
    id = src.data.remoteNodeId
    handle = src.data.remoteHandle || handle
    src = nodes.find((item) => item.id === id)
  }
  if (!handle && (src?.type === 'time' || src?.type === 'const')) handle = PORT.signalOut
  return { sourceId: id, handle, src }
}

export function readNumericSource(
  values: Record<string, number | null>,
  sourceId: string,
  sourceHandle: string | undefined,
  src: WiredNode | undefined,
): number | null {
  if (src?.type === 'time') {
    const out = livePinValueAtHandle(values, sourceId, PORT.signalOut)
    if (out != null) return out
    return Math.max(0.1, src.data.windowSec)
  }
  if (src?.type === 'const') {
    const handle = sourceHandle ?? PORT.signalOut
    const live = livePinValueAtHandle(values, sourceId, handle)
    return live ?? src.data.amplitude
  }
  if (!sourceHandle) return null
  const keyed = livePinValueAtHandle(values, sourceId, sourceHandle)
  if (keyed != null) return keyed
  return livePinValue(values, sourceId, sourceHandle)
}

export function resolveWiredNumeric(
  values: Record<string, number | null>,
  nodes: WiredNode[],
  edges: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[],
  nodeId: string,
  targetHandle: string,
  fallback: number,
): number {
  const edge = edges.find(
    (item) => item.target === nodeId && (item.targetHandle ?? '') === targetHandle,
  )
  if (!edge) return fallback
  const resolved = resolveSignalSource(nodes, edge.source, edge.sourceHandle)
  const live = readNumericSource(values, resolved.sourceId, resolved.handle, resolved.src)
  return live ?? fallback
}

/** @deprecated use resolveWiredNumeric */
export function wiredParamValue(
  values: Record<string, number | null>,
  edges: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[],
  nodeId: string,
  targetHandle: string,
  fallback: number,
): number {
  return resolveWiredNumeric(values, [], edges, nodeId, targetHandle, fallback)
}
