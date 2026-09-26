export const PORT = {
  signalOut: 'out-signal',
  signalOut2: 'out-signal-2',
  signalOut3: 'out-signal-3',
  signalOut4: 'out-signal-4',
  signalIn: 'in-signal',
  signalIn2: 'in-signal-2',
  signalIn3: 'in-signal-3',
  signalIn4: 'in-signal-4',
  signalIn5: 'in-signal-5',
  timeOut: 'out-time',
  timeIn: 'in-time',
  timeIn2: 'in-time-2',
  boolOut: 'out-bool',
  boolIn: 'in-bool',
  boolIn2: 'in-bool-2',
  boolIn3: 'in-bool-3',
} as const

export function boolInPort(index: number): string {
  return index <= 0 ? PORT.boolIn : `in-bool-${index + 1}`
}

export function boolOutPort(index: number): string {
  return index <= 0 ? PORT.boolOut : `out-bool-${index + 1}`
}

export function portKindOf(handle?: string | null): 'signal' | 'time' | 'bool' | null {
  if (!handle) return null
  if (handle.includes('signal')) return 'signal'
  if (handle.includes('time')) return 'time'
  if (handle.includes('bool')) return 'bool'
  return null
}

export function samePortKind(sourceHandle?: string | null, targetHandle?: string | null): boolean {
  const source = portKindOf(sourceHandle)
  const target = portKindOf(targetHandle)
  if (!source || !target) return false
  const numeric = (source === 'signal' || source === 'time') && (target === 'signal' || target === 'time')
  if (!numeric && source !== target) return false
  return Boolean(sourceHandle?.startsWith('out') && targetHandle?.startsWith('in'))
}
