import { BLOCKS } from './blocks'
import type { AppNodeData, SignalKind, ToolId } from './types'

export type ToolDef = {
  id: ToolId
  label: string
  hint: string
  ports: string
  accent: string
}

export const TOOLS: ToolDef[] = BLOCKS.map((block) => ({
  id: block.id,
  label: block.label,
  hint: block.hint,
  ports: block.ports,
  accent: block.color,
}))

export const SIGNAL_OPTIONS: { id: SignalKind; label: string }[] = [
  { id: 'sine', label: 'Sinüs' },
  { id: 'noisySine', label: 'Gürültülü sinüs' },
  { id: 'square', label: 'Kare dalga' },
  { id: 'saw', label: 'Testere' },
  { id: 'walk', label: 'Rastgele yürüyüş' },
]

export const SIGNAL_PRESETS: {
  id: string
  label: string
  signalKind: SignalKind
  frequency: number
  amplitude: number
  color: string
  position: { x: number; y: number }
}[] = [
  { id: 'sig-a', label: 'Sinyal A · Sinüs', signalKind: 'sine', frequency: 0.2, amplitude: 1, color: '#4ea1ff', position: { x: 24, y: 16 } },
  { id: 'sig-b', label: 'Sinyal B · Gürültü', signalKind: 'noisySine', frequency: 0.2, amplitude: 1, color: '#38bdf8', position: { x: 24, y: 128 } },
  { id: 'sig-c', label: 'Sinyal C · Kare', signalKind: 'square', frequency: 0.15, amplitude: 1, color: '#818cf8', position: { x: 24, y: 240 } },
  { id: 'sig-d', label: 'Sinyal D · Testere', signalKind: 'saw', frequency: 0.18, amplitude: 1, color: '#22d3ee', position: { x: 24, y: 352 } },
]

export function defaultNodeData(tool: ToolId, patch: Partial<AppNodeData> = {}): AppNodeData {
  const def = BLOCKS.find((item) => item.id === tool)
  return {
    label: def?.label ?? tool,
    signalKind: 'sine',
    amplitude: 1,
    frequency: 0.2,
    windowSec: 10,
    delaySec: 0,
    color: def?.color ?? '#8fb0c9',
    digitalMode: 'off',
    kp: 1,
    ti: 5,
    td: 0,
    limitMin: 0,
    limitMax: 1,
    hysLow: 0.3,
    hysHigh: 0.7,
    preset: 5,
    rampSec: 5,
    noteText: 'Açıklama yazın',
    fontSize: 13,
    inputCount: 3,
    ...patch,
  }
}

export function toolById(id: ToolId): ToolDef {
  const found = TOOLS.find((item) => item.id === id)
  if (!found) throw new Error(`Bilinmeyen araç: ${id}`)
  return found
}
