import { PORT, boolInPort, boolOutPort, portKindOf } from './ports'
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

export const SAMPLE_WINDOW_MAX = 120

export function clampSampleWindow(value: number): number {
  if (!Number.isFinite(value)) return 10
  return Math.min(SAMPLE_WINDOW_MAX, Math.max(2, Math.round(value)))
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

export function boolRoutePins(count: number): IoPin[] {
  const n = clampInputCount(count)
  const pins: IoPin[] = []
  for (let index = 0; index < n; index++) {
    pins.push({
      id: boolInPort(index),
      side: 'in',
      kind: 'bool',
      label: `IN${index + 1}`,
      row: index,
    })
    pins.push({
      id: boolOutPort(index),
      side: 'out',
      kind: 'bool',
      label: `OUT${index + 1}`,
      row: index,
    })
  }
  return pins
}

export const BLOCKS: BlockDef[] = [
  { id: 'signal', category: 'source', label: 'Sinyal', hint: 'Analog sinyal kaynağı', ports: 'çıkış: sinyal', fbType: 'SIG', header: C.source, color: '#4ea1ff', pins: [{ id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'digital', category: 'source', label: 'Dijital', hint: 'BOOL kaynak: 0 / 1 / pulse', ports: 'çıkış: bool', fbType: 'BOOL', header: C.source, color: '#2e8b57', pins: [{ id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  {
    id: 'const',
    category: 'source',
    label: 'Sabit (K)',
    hint: 'Girdiğiniz sayıyı OUT’ta sürekli verir',
    ports: 'OUT: sabit sinyal',
    fbType: 'K',
    header: C.math,
    color: '#e8b84a',
    pins: [{ id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }],
  },
  {
    id: 'time',
    category: 'timing',
    label: 'Zaman',
    hint: 'IN=1 (bağlı) iken geri sayım · bitince Q=1 · OUT süre',
    ports: 'IN bool · Q, OUT',
    fbType: 'TIME',
    header: C.timing,
    color: '#e8b84a',
    pins: [
      { id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN', row: 0 },
      { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 1 },
    ],
  },
  {
    id: 'and',
    category: 'logic',
    label: 'AND',
    hint: 'Bağlı girişlerin hepsi 1 → Q=1',
    ports: 'IN1…n → Q',
    fbType: 'AND',
    header: C.logic,
    color: '#8b6bb5',
    pins: interlockPins(2),
  },
  {
    id: 'or',
    category: 'logic',
    label: 'OR',
    hint: 'Bağlı girişlerden biri 1 → Q=1',
    ports: 'IN1…n → Q',
    fbType: 'OR',
    header: C.logic,
    color: '#8b6bb5',
    pins: interlockPins(2),
  },
  {
    id: 'xor',
    category: 'logic',
    label: 'XOR',
    hint: 'Bağlı girişlerde tek sayıda 1 → Q=1',
    ports: 'IN1…n → Q',
    fbType: 'XOR',
    header: C.logic,
    color: '#8b6bb5',
    pins: interlockPins(2),
  },
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
  {
    id: 'limit',
    category: 'math',
    label: 'LIMIT',
    hint: 'OUT = IN, MN–MX arasında',
    ports: 'IN, MN, MX → OUT',
    fbType: 'LIMIT',
    header: C.math,
    color: '#6b8ca3',
    pins: [
      { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 },
      { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'MN', row: 1 },
      { id: PORT.signalIn3, side: 'in', kind: 'signal', label: 'MX', row: 2 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 },
    ],
  },
  {
    id: 'norm',
    category: 'math',
    label: 'Norm',
    hint: 'Alt hedef → −5 · üst hedef → +5 · OUT her zaman −5…+5',
    ports: 'Değer, alt/üst hedef → OUT',
    fbType: 'NORM',
    header: C.math,
    color: '#5a7ca3',
    pins: [
      { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'Değer', row: 0 },
      { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'Alt hedef', row: 1 },
      { id: PORT.signalIn3, side: 'in', kind: 'signal', label: 'Üst hedef', row: 2 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 },
    ],
  },
  {
    id: 'limitler',
    category: 'math',
    label: 'Limitler',
    hint: 'Limit ve hedef seti · 4 çıkış',
    ports: '4 giriş → 4 çıkış',
    fbType: 'LIM',
    header: C.math,
    color: '#6b8ca3',
    pins: [
      { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'Alt limit', row: 0 },
      { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'Üst limit', row: 1 },
      { id: PORT.signalIn3, side: 'in', kind: 'signal', label: 'Alt hedef', row: 2 },
      { id: PORT.signalIn4, side: 'in', kind: 'signal', label: 'Üst hedef', row: 3 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'Alt limit', row: 0 },
      { id: PORT.signalOut2, side: 'out', kind: 'signal', label: 'Üst limit', row: 1 },
      { id: PORT.signalOut3, side: 'out', kind: 'signal', label: 'Alt hedef', row: 2 },
      { id: PORT.signalOut4, side: 'out', kind: 'signal', label: 'Üst hedef', row: 3 },
    ],
  },
  {
    id: 'tamSayi',
    category: 'math',
    label: 'Tam sayı',
    hint: 'Ondalık IN → tam sayı OUT (mod Inspector’da)',
    ports: 'IN → OUT',
    fbType: 'INT',
    header: C.math,
    color: '#6b8ca3',
    pins: [
      { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 },
    ],
  },
  {
    id: 'degisim',
    category: 'math',
    label: 'Değişim',
    hint: 'OUT = |IN − önceki IN| (≥0) · Fark pinine bağlanır',
    ports: 'IN → Fark',
    fbType: 'DGR',
    header: C.math,
    color: '#5a8ca3',
    pins: [
      { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'Fark', row: 0 },
    ],
  },
  {
    id: 'oluBant',
    category: 'math',
    label: 'Ölü bant',
    hint: 'Fark<X ise OUT sabit · Fark = Değişim bloğu',
    ports: 'IN, Fark, X → OUT',
    fbType: 'OLB',
    header: C.math,
    color: '#5a8ca3',
    pins: [
      { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 },
      { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'Fark', row: 1 },
      { id: PORT.signalIn3, side: 'in', kind: 'signal', label: 'X', row: 2 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 },
    ],
  },
  {
    id: 'spikeFilt',
    category: 'math',
    label: 'Sıçrama filtresi',
    hint: 'Fark>X ise OUT tutulur · Fark = Değişim bloğu',
    ports: 'IN, Fark, X → OUT',
    fbType: 'SPIKE',
    header: C.math,
    color: '#5a8ca3',
    pins: [
      { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 },
      { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'Fark', row: 1 },
      { id: PORT.signalIn3, side: 'in', kind: 'signal', label: 'X', row: 2 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 },
    ],
  },
  {
    id: 'winMinMax',
    category: 'math',
    label: 'Pencere Min/Max',
    hint: 'Son N örnekte tepe ve dip',
    ports: 'IN → MAX, MIN',
    fbType: 'WMM',
    header: C.math,
    color: '#5a8ca3',
    pins: [
      { id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 },
      { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'MAX', row: 0 },
      { id: PORT.signalOut2, side: 'out', kind: 'signal', label: 'MIN', row: 1 },
    ],
  },
  { id: 'ton', category: 'timing', label: 'TON', hint: 'Çekmede gecikme', ports: 'IN, PT → Q', fbType: 'TON', header: C.timing, color: '#e8b84a', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'PT', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'tof', category: 'timing', label: 'TOF', hint: 'Bırakmada gecikme', ports: 'IN, PT → Q', fbType: 'TOF', header: C.timing, color: '#e8b84a', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'IN', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'PT', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'ctu', category: 'timing', label: 'CTU', hint: 'Yükselen kenarla say', ports: 'CU, R → Q', fbType: 'CTU', header: C.timing, color: '#e8b84a', pins: [{ id: PORT.boolIn, side: 'in', kind: 'bool', label: 'CU', row: 0 }, { id: PORT.boolIn2, side: 'in', kind: 'bool', label: 'R', row: 1 }, { id: PORT.boolOut, side: 'out', kind: 'bool', label: 'Q', row: 0 }] },
  { id: 'ma', category: 'control', label: 'MA', hint: 'OUT: şimdi · ÖNCE: gecikmeli pencere (gradyan)', ports: 'sinyal, zaman, gecikme → OUT, ÖNCE', fbType: 'MA', header: C.control, color: '#3ee0b0', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'Sinyal', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'Zaman', row: 1 }, { id: PORT.timeIn2, side: 'in', kind: 'time', label: 'Gecikme', row: 2 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }, { id: PORT.signalOut2, side: 'out', kind: 'signal', label: 'ÖNCE', row: 2 }] },
  { id: 'pid', category: 'control', label: 'PID', hint: 'CTRL_PID: SP − PV', ports: 'PV, SP → LMN', fbType: 'PID', header: C.control, color: '#3ee0b0', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'PV', row: 0 }, { id: PORT.signalIn2, side: 'in', kind: 'signal', label: 'SP', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'LMN', row: 0 }] },
  { id: 'ramp', category: 'control', label: 'RAMP', hint: 'Setpoint rampası', ports: 'IN, TM → OUT', fbType: 'RAMP', header: C.control, color: '#3ee0b0', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: 'IN', row: 0 }, { id: PORT.timeIn, side: 'in', kind: 'time', label: 'TM', row: 1 }, { id: PORT.signalOut, side: 'out', kind: 'signal', label: 'OUT', row: 0 }] },
  { id: 'interlock', category: 'drive', label: 'Interlock', hint: 'Bağlı koşullar AND → serbest', ports: 'IN1…n → Q', fbType: 'INTLK', header: C.drive, color: '#c45c6a', pins: interlockPins(3) },
  {
    id: 'boolRoute',
    category: 'logic',
    label: 'Koşul OUT',
    hint: 'IN1=1 → OUT1=1 · her kanal bağımsız',
    ports: 'IN1→OUT1 … INn→OUTn',
    fbType: 'BRT',
    header: C.logic,
    color: '#9b7ec8',
    pins: boolRoutePins(3),
  },
  { id: 'sheetIn', category: 'docs', label: 'Sayfa girişi', hint: 'Diğer sayfadan gelen sinyal', ports: 'liste', fbType: 'I', header: C.source, color: '#4ea1ff', pins: [{ id: PORT.signalOut, side: 'out', kind: 'signal', label: '', row: 0 }] },
  { id: 'sheetOut', category: 'docs', label: 'Sayfa çıkışı', hint: 'Diğer sayfaya giden sinyal', ports: 'liste', fbType: 'O', header: C.output, color: '#8fb0c9', pins: [{ id: PORT.signalIn, side: 'in', kind: 'signal', label: '', row: 0 }] },
  { id: 'sheetLane', category: 'docs', label: 'Sinyal bölgesi', hint: 'Gelen / giden kolon', ports: '', fbType: 'LANE', header: C.docs, color: '#8fb0c9', pins: [] },
  { id: 'hopPanel', category: 'docs', label: 'Çıkış açıklaması', hint: 'Çıkışın gittiği yerler', ports: '', fbType: 'HOP', header: C.docs, color: '#c9a227', pins: [] },
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

export function nodeUsesInputCount(type?: ToolId): boolean {
  return (
    type === 'interlock' ||
    type === 'boolRoute' ||
    type === 'and' ||
    type === 'or' ||
    type === 'xor'
  )
}

export function pinsForNode(node: { type?: ToolId; data: { inputCount: number; remoteHandle?: string } }): IoPin[] {
  if (!node.type || node.type === 'note' || node.type === 'sheetLane' || node.type === 'hopPanel') return []
  if (node.type === 'interlock' || node.type === 'and' || node.type === 'or' || node.type === 'xor') {
    return interlockPins(node.data.inputCount)
  }
  if (node.type === 'boolRoute') return boolRoutePins(node.data.inputCount)
  if (node.type === 'sheetIn' || node.type === 'sheetOut') {
    const kind = portKindOf(node.data.remoteHandle) ?? 'signal'
    const input = kind === 'time' ? PORT.timeIn : kind === 'bool' ? PORT.boolIn : PORT.signalIn
    const output = kind === 'time' ? PORT.timeOut : kind === 'bool' ? PORT.boolOut : PORT.signalOut
    return [
      { id: input, side: 'in', kind, label: 'IN', row: 0 },
      { id: output, side: 'out', kind, label: 'OUT', row: 0 },
    ]
  }
  return blockById(node.type).pins
}
