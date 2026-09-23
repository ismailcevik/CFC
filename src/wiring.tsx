import { createContext, useContext } from 'react'
import { pinsForNode } from './blocks'
import { portKindOf } from './ports'
import type { AppNode, PortKind } from './types'

export type WirePin = {
  nodeId: string
  handle: string
  side: 'in' | 'out'
  kind: PortKind
}

export type WiringApi = {
  pending: WirePin | null
  pick: (pin: WirePin) => void
  cancel: () => void
  isPending: (nodeId: string, handle: string) => boolean
  isCompatible: (pin: WirePin) => boolean
}

export const WiringContext = createContext<WiringApi>({
  pending: null,
  pick: () => undefined,
  cancel: () => undefined,
  isPending: () => false,
  isCompatible: () => false,
})

export function useWiring() {
  return useContext(WiringContext)
}

export function pinFromHandle(nodeId: string, handle: string): WirePin | null {
  const kind = portKindOf(handle)
  if (!kind) return null
  const side = handle.startsWith('out') ? 'out' : handle.startsWith('in') ? 'in' : null
  if (!side) return null
  return { nodeId, handle, side, kind }
}

export function defaultOutputPin(node: AppNode): WirePin | null {
  const pin = pinsForNode(node).find((item) => item.side === 'out')
  if (!pin) return null
  return { nodeId: node.id, handle: pin.id, side: 'out', kind: pin.kind }
}

export function firstCompatiblePin(node: AppNode, pending: WirePin): WirePin | null {
  const want = pending.side === 'out' ? 'in' : 'out'
  const pin = pinsForNode(node).find((item) => item.side === want && item.kind === pending.kind)
  if (!pin) return null
  return { nodeId: node.id, handle: pin.id, side: pin.side, kind: pin.kind }
}

export function canWire(a: WirePin, b: WirePin): boolean {
  if (a.nodeId === b.nodeId || a.kind !== b.kind) return false
  return (a.side === 'out' && b.side === 'in') || (a.side === 'in' && b.side === 'out')
}

export function toConnection(a: WirePin, b: WirePin) {
  const source = a.side === 'out' ? a : b
  const target = a.side === 'out' ? b : a
  return {
    source: source.nodeId,
    sourceHandle: source.handle,
    target: target.nodeId,
    targetHandle: target.handle,
  }
}
