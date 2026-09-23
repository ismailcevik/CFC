import type { Edge, Node } from '@xyflow/react'

export type ToolId =
  | 'signal'
  | 'digital'
  | 'time'
  | 'and'
  | 'or'
  | 'xor'
  | 'not'
  | 'rs'
  | 'gt'
  | 'lt'
  | 'eq'
  | 'hys'
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'limit'
  | 'ton'
  | 'tof'
  | 'ctu'
  | 'ma'
  | 'pt1'
  | 'pid'
  | 'ramp'
  | 'sel'
  | 'interlock'
  | 'note'
  | 'display'

export type PortKind = 'signal' | 'time' | 'bool'

export type SignalKind = 'sine' | 'noisySine' | 'square' | 'saw' | 'walk'
export type DigitalMode = 'off' | 'on' | 'pulse'
export type ToolCategory = 'source' | 'logic' | 'compare' | 'math' | 'timing' | 'control' | 'drive' | 'docs' | 'output'

export type AppNodeData = {
  label: string
  signalKind: SignalKind
  amplitude: number
  frequency: number
  windowSec: number
  delaySec: number
  color: string
  digitalMode: DigitalMode
  kp: number
  ti: number
  td: number
  limitMin: number
  limitMax: number
  hysLow: number
  hysHigh: number
  preset: number
  rampSec: number
  noteText: string
  fontSize: number
  inputCount: number
}

export type AppNode = Node<AppNodeData, ToolId>
export type AppEdge = Edge

export type WorkPage = {
  id: string
  name: string
  title: string
  nodes: AppNode[]
  edges: AppEdge[]
}

export type Sample = {
  t: number
  v: number
}

export type NodeRuntime = {
  q?: boolean
  y?: number
  acc?: number
  lastIn?: boolean
  lastErr?: number
  integral?: number
  count?: number
}

export type RuntimeSnapshot = {
  t: number
  running: boolean
  values: Record<string, number | null>
  series: Record<string, Sample[]>
}

export const SAMPLE_HZ = 20
export const SAMPLE_DT = 1 / SAMPLE_HZ
export const HISTORY_SEC = 120
