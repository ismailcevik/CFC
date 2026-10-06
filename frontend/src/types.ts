import type { Edge, Node } from '@xyflow/react'

export type ToolId =
  | 'signal'
  | 'digital'
  | 'const'
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
  | 'norm'
  | 'limitler'
  | 'tamSayi'
  | 'degisim'
  | 'oluBant'
  | 'spikeFilt'
  | 'winMinMax'
  | 'ton'
  | 'tof'
  | 'ctu'
  | 'ma'
  | 'pid'
  | 'ramp'
  | 'interlock'
  | 'boolRoute'
  | 'sheetIn'
  | 'sheetOut'
  | 'sheetLane'
  | 'hopPanel'
  | 'note'
  | 'display'

export type PortKind = 'signal' | 'time' | 'bool'

export type SignalKind = 'sine' | 'noisySine' | 'square' | 'saw' | 'walk'
export type DigitalMode = 'off' | 'on' | 'pulse'
export type TamSayiMode = 'trunc' | 'round' | 'floor' | 'ceil'
export type ToolCategory = 'source' | 'logic' | 'compare' | 'math' | 'timing' | 'control' | 'drive' | 'docs' | 'output'

export type AppNodeData = {
  label: string
  signalKind: SignalKind
  amplitude: number
  offset: number
  frequency: number
  windowSec: number
  delaySec: number
  color: string
  digitalMode: DigitalMode
  tamSayiMode: TamSayiMode
  kp: number
  ti: number
  td: number
  limitMin: number
  limitMax: number
  normAlt: number
  normUst: number
  hysLow: number
  hysHigh: number
  preset: number
  rampSec: number
  noteText: string
  fontSize: number
  inputCount: number
  busName: string
  remoteNodeId: string
  remoteHandle: string
  remotePageId: string
}

export type AppNode = Node<AppNodeData, ToolId>
export type AppEdge = Edge

export type WorkPage = {
  id: string
  name: string
  title: string
  family?: string
  section?: string
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
  /** Sıçrama filtresi: son OUT ve bir önceki IN (|ΔIN| hesabı) */
  spikeOut?: number
  spikeLastIn?: number
  degisimPrevIn?: number
  oluBantOut?: number
  acc?: number
  lastIn?: boolean
  lastErr?: number
  integral?: number
  count?: number
  samples?: number[]
}

export type RuntimeSnapshot = {
  t: number
  running: boolean
  values: Record<string, number | null>
  series: Record<string, Sample[]>
}

export const SAMPLE_HZ = 20
export const SAMPLE_DT = 1 / SAMPLE_HZ
export const HISTORY_SEC = 180
