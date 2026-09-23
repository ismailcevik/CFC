import { PORT, boolInPort } from './ports'
import type { PortKind, ToolCategory, ToolId } from './types'

export type IoPin = {
  id: string
  side: 'in' | 'out'
  kind: PortKind
  label: string
  row: number
}

export type BlockDef = {
  id: ToolId
  category: ToolCategory
  label: string
  hint: string
  ports: string
  fbType: string
  header: string
  color: string
  pins: IoPin[]
}

export const CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: 'source', label: 'Kaynak' },
  { id: 'logic', label: 'Mantık' },
  { id: 'compare', label: 'Karşılaştırma' },
  { id: 'math', label: 'Aritmetik' },
  { id: 'timing', label: 'Zaman / Sayıcı' },
  { id: 'control', label: 'Kontrol' },
  { id: 'drive', label: 'Sürücü / Vana' },
  { id: 'docs', label: 'Dokümantasyon' },
  { id: 'output', label: 'Çıktı' },
]

const C = {
  source: '#0b4a86',
  logic: '#5a3d7a',
  compare: '#8a4a12',
  math: '#355065',
  timing: '#8a6a12',
  control: '#0d5c45',
  drive: '#7a2e3a',
  docs: '#8a6a12',
  output: '#355065',
}

export const INTERLOCK_MAX = 16

export function clampInputCount(value: number): number {
  if (!Number.isFinite(value)) return 3
  return Math.min(INTERLOCK_MAX, Math.max(1, Math.round(value)))
}

export function interlockPins(count: number): IoPin[] {
  const n = clampInputCount(count)
  return [
    ...Array.from({ length: n }, (_, index) => ({
      id: boolInPort(index),
      side: 'in' as const,
      kind: 'bool' as const,
      label: `IN${index + 1}`,
      row: index,
    })),
    { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 },
  ]
}

export const BLOCKS: BlockDef[] = [
  { id: 'signal', category: 'source', label: 'Sinyal', hint: 'Analog sinyal kaynağı', ports: 'çıkış: sinyal', fbType: 'SIG', header: C.source, color: '#4ea1ff', pins: [{ id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'digital', category: 'source', label: 'Dijital', hint: 'BOOL kaynak: 0 / 1 / pulse', ports: 'çıkış: bool', fbType: 'BOOL', header: C.source, color: '#2e8b57', pins: [{ id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'time', category: 'source', label: 'Zaman', hint: 'Pencere veya PT süresi', ports: 'çıkış: zaman', fbType: 'TIME', header: C.timing, color: '#e8b84a', pins: [{ id: PORT.timeOut, side: 'out', kind: 'time', label: 'T', row: 0 }] },
  { id: 'and', category: 'logic', label: 'AND', hint: 'Q = IN1 AND IN2', ports: 'giriş: 2 bool', fbType: 'AND', header: C.logic, color: '#8b6bb5', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN1', row: 0 }, { id: PORT.boolIn2, side: 'in', kind: 'bool', label: 'IN2', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'or', category: 'logic', label: 'OR', hint: 'Q = IN1 OR IN2', ports: 'giriş: 2 bool', fbType: 'OR', header: C.logic, color: '#8b6bb5', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN1', row: 0 }, { id: PORT.boolIn2, side: 'in', kind: 'bool', label: 'IN2', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'xor', category: 'logic', label: 'XOR', hint: 'Q = IN1 XOR IN2', ports: 'giriş: 2 bool', fbType: 'XOR', header: C.logic, color: '#8b6bb5', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN1', row: 0 }, { id: PORT.boolIn2, side: 'in', kind: 'bool', label: 'IN2', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'not', category: 'logic', label: 'NOT', hint: 'Q = NOT IN', ports: 'giriş: bool', fbType: 'NOT', header: C.logic, color: '#8b6bb5', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN', row: 0 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'rs', category: 'logic', label: 'RS', hint: 'Set / Reset tutucu', ports: 'S, R1 → Q', fbType: 'RS', header: C.logic, color: '#8b6bb5', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'S', row: 0 }, { id: PORT.boolIn2, side: 'in', kind: 'bool', label: 'R1', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'gt', category: 'compare', label: 'GT', hint: 'Q = IN1 > IN2', ports: '2 sinyal → bool', fbType: 'GT', header: C.compare, color: '#d0892c', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN1', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'IN2', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'lt', category: 'compare', label: 'LT', hint: 'Q = IN1 < IN2', ports: '2 sinyal → bool', fbType: 'LT', header: C.compare, color: '#d0892c', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN1', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'IN2', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'eq', category: 'compare', label: 'EQ', hint: 'Q = IN1 = IN2', ports: '2 sinyal → bool', fbType: 'EQ', header: C.compare, color: '#d0892c', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN1', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'IN2', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'hys', category: 'compare', label: 'HYS', hint: 'Histerezis eşik', ports: 'sinyal → bool', fbType: 'HYS', header: C.compare, color: '#d0892c', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'add', category: 'math', label: 'ADD', hint: 'OUT = IN1 + IN2', ports: '2 sinyal', fbType: 'ADD', header: C.math, color: '#6b8ca3', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN1', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'IN2', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'sub', category: 'math', label: 'SUB', hint: 'OUT = IN1 − IN2', ports: '2 sinyal', fbType: 'SUB', header: C.math, color: '#6b8ca3', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN1', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'IN2', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'mul', category: 'math', label: 'MUL', hint: 'OUT = IN1 × IN2', ports: '2 sinyal', fbType: 'MUL', header: C.math, color: '#6b8ca3', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN1', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'IN2', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'div', category: 'math', label: 'DIV', hint: 'OUT = IN1 ÷ IN2', ports: '2 sinyal', fbType: 'DIV', header: C.math, color: '#6b8ca3', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN1', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'IN2', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'limit', category: 'math', label: 'LIMIT', hint: 'Çıkışı MN–MX arası tut', ports: 'sinyal', fbType: 'LIMIT', header: C.math, color: '#6b8ca3', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'ton', category: 'timing', label: 'TON', hint: 'Çekmede gecikme', ports: 'IN, PT → Q', fbType: 'TON', header: C.timing, color: '#e8b84a', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'PT', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'tof', category: 'timing', label: 'TOF', hint: 'Bırakmada gecikme', ports: 'IN, PT → Q', fbType: 'TOF', header: C.timing, color: '#e8b84a', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'PT', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'ctu', category: 'timing', label: 'CTU', hint: 'Yükselen kenarla say', ports: 'CU, R → Q', fbType: 'CTU', header: C.timing, color: '#e8b84a', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'CU', row: 0 }, { id: PORT.boolIn2, side: 'in', kind: 'bool', label: 'R', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'ma', category: 'control', label: 'MA', hint: 'Kayar ortalama: pencere + isteğe bağlı gecikme', ports: 'sinyal, zaman, gecikme', fbType: 'MA', header: C.control, color: '#3ee0b0', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'Sinyal', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'Zaman', row: 1 }, { id: PORT.timeIn2, side: 'in', kind: 'time', label: 'Gecikme', row: 2 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'pt1', category: 'control', label: 'PT1', hint: '1. derece süzgeç', ports: 'IN, T → OUT', fbType: 'PT1', header: C.control, color: '#3ee0b0', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'TM', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'pid', category: 'control', label: 'PID', hint: 'CTRL_PID: SP − PV', ports: 'PV, SP → LMN', fbType: 'PID', header: C.control, color: '#3ee0b0', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'PV', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'SP', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'LMN', row: 0 }] },
  { id: 'ramp', category: 'control', label: 'RAMP', hint: 'Setpoint rampası', ports: 'IN, TM → OUT', fbType: 'RAMP', header: C.control, color: '#3ee0b0', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'TM', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'sel', category: 'control', label: 'SEL', hint: 'G=0 → IN0, G=1 → IN1', ports: 'G, IN0, IN1', fbType: 'SEL', header: C.control, color: '#3ee0b0', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'G', row: 0 }, { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN0', row: 1 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'IN1', row: 2 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'interlock', category: 'drive', label: 'Interlock', hint: 'Bağlı koşullar AND → serbest', ports: 'IN1…n → Q', fbType: 'INTLK', header: C.drive, color: '#c45c6a', pins: interlockPins(3) },
  { id: 'note', category: 'docs', label: 'Metin', hint: 'Tuvale serbest açıklama', ports: 'pin yok · sürükle bırak', fbType: 'TEXT', header: C.docs, color: '#c9a227', pins: [] },
  { id: 'display', category: 'output', label: 'Çıktı', hint: 'Değeri gösterir', ports: 'giriş: sinyal', fbType: 'OUT', header: C.output, color: '#8fb0c9', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 }] },
]

export function blockById(id: ToolId): BlockDef {
  const found = BLOCKS.find((item) => item.id === id)
  if (!found) throw new Error(`Bilinmeyen blok: ${id}`)
  return found
}

export function blockRows(def: BlockDef): number {
  return Math.max(1, ...def.pins.map((pin) => pin.row + 1))
}

export function pinsForNode(node: { type?: ToolId; data: { inputCount: number } }): IoPin[] {
  if (!node.type || node.type === 'note') return []
  if (node.type === 'interlock') return interlockPins(node.data.inputCount)
  return blockById(node.type).pins
}
