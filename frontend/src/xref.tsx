import { createContext, useContext } from 'react'
import { blockById, pinsForNode } from './blocks'
import type { AppEdge, AppNode, ToolId, WorkPage } from './types'

export type XrefLink = {
  pageId: string
  pageName: string
  nodeId: string
  handle: string
  label: string
  pinLabel: string
  fbType: string
  samePage: boolean
}

export type XrefApi = {
  incoming: (nodeId: string, handle: string) => XrefLink[]
  outgoing: (nodeId: string, handle: string) => XrefLink[]
  routes: (nodeId: string, handle: string, side: 'in' | 'out') => XrefLink[]
  jump: (link: XrefLink) => void
  trace: (nodeId: string, handle: string) => void
  disconnect: (nodeId: string, handle: string, side: 'in' | 'out', link: XrefLink) => void
  focusKey: string | null
}

export const XrefContext = createContext<XrefApi>({
  incoming: () => [],
  outgoing: () => [],
  routes: () => [],
  jump: () => undefined,
  trace: () => undefined,
  disconnect: () => undefined,
  focusKey: null,
})

export function parseFocusKey(key: string | null) {
  if (!key) return null
  const split = key.lastIndexOf(':')
  if (split <= 0) return null
  return { nodeId: key.slice(0, split), handle: key.slice(split + 1) }
}

export function edgeTouchesPin(edge: AppEdge, nodeId: string, handle: string) {
  return (
    (edge.source === nodeId && (edge.sourceHandle ?? '') === handle) ||
    (edge.target === nodeId && (edge.targetHandle ?? '') === handle)
  )
}

export function traceKeys(pages: WorkPage[], nodeId: string, handle: string) {
  const keys = new Set([xrefKey(nodeId, handle)])
  const here = findNode(pages, nodeId)
  if (here && (here.node.type === 'sheetIn' || here.node.type === 'sheetOut') && here.node.data.remoteNodeId) {
    keys.add(xrefKey(here.node.data.remoteNodeId, here.node.data.remoteHandle))
  }
  for (const side of ['in', 'out'] as const) {
    for (const link of collectRoutes(pages, nodeId, handle, side)) {
      keys.add(xrefKey(link.nodeId, link.handle))
    }
  }
  return keys
}

export function isTracedEdge(edge: AppEdge, nodes: AppNode[], keys: Set<string>) {
  if (keys.has(xrefKey(edge.source, edge.sourceHandle ?? '')) || keys.has(xrefKey(edge.target, edge.targetHandle ?? ''))) {
    return true
  }
  const source = nodes.find((node) => node.id === edge.source)
  const target = nodes.find((node) => node.id === edge.target)
  if (source?.type === 'sheetIn' && keys.has(xrefKey(source.data.remoteNodeId, source.data.remoteHandle))) return true
  if (target?.type === 'sheetOut' && keys.has(xrefKey(target.data.remoteNodeId, target.data.remoteHandle))) return true
  return false
}

export function useXref() {
  return useContext(XrefContext)
}

export function pageOfNode(pages: WorkPage[], nodeId: string): WorkPage | undefined {
  return pages.find((page) => page.nodes.some((node) => node.id === nodeId))
}

export function allPageEdges(pages: WorkPage[]): AppEdge[] {
  return pages.flatMap((page) => page.edges)
}

export function xrefKey(nodeId: string, handle: string) {
  return `${nodeId}:${handle}`
}

function findNode(pages: WorkPage[], nodeId: string): { page: WorkPage; node: AppNode } | undefined {
  for (const page of pages) {
    const node = page.nodes.find((item) => item.id === nodeId)
    if (node) return { page, node }
  }
  return undefined
}

function isChrome(node?: { type?: string | null }) {
  return node?.type === 'sheetIn' || node?.type === 'sheetOut' || node?.type === 'sheetLane' || node?.type === 'note' || node?.type === 'hopPanel'
}

function pinLabelOf(node: AppNode, handle?: string | null) {
  if (!handle) return ''
  return pinsForNode(node).find((pin) => pin.id === handle)?.label ?? handle
}

function toLink(
  here: WorkPage,
  remote: { page: WorkPage; node: AppNode },
  handle: string,
): XrefLink {
  return {
    pageId: remote.page.id,
    pageName: remote.page.name,
    nodeId: remote.node.id,
    handle,
    label: remote.node.data.label,
    pinLabel: pinLabelOf(remote.node, handle),
    fbType: blockById((remote.node.type ?? 'signal') as ToolId).fbType,
    samePage: remote.page.id === here.id,
  }
}

export function collectXrefs(
  pages: WorkPage[],
  nodeId: string,
  handle: string,
  side: 'in' | 'out',
): XrefLink[] {
  return collectRoutes(pages, nodeId, handle, side).filter((link) => !link.samePage)
}

export function collectRoutes(
  pages: WorkPage[],
  nodeId: string,
  handle: string,
  side: 'in' | 'out',
): XrefLink[] {
  const here = findNode(pages, nodeId)
  if (!here) return []
  const seen = new Map<string, XrefLink>()
  const add = (remoteId?: string, remoteHandle?: string | null) => {
    if (!remoteId) return
    let remote = findNode(pages, remoteId)
    let handle = remoteHandle ?? ''
    while (remote && isChrome(remote.node) && remote.node.data.remoteNodeId) {
      handle = remote.node.data.remoteHandle || handle
      remote = findNode(pages, remote.node.data.remoteNodeId)
    }
    if (!remote || isChrome(remote.node)) return
    const key = `${remote.node.id}:${handle}`
    if (seen.has(key)) return
    seen.set(key, toLink(here.page, remote, handle))
  }

  for (const edge of allPageEdges(pages)) {
    if (edge.id.startsWith('hop-e-') || edge.className === 'hop-edge') continue
    const remoteId = side === 'out' ? edge.target : edge.source
    const localId = side === 'out' ? edge.source : edge.target
    const localHandle = side === 'out' ? edge.sourceHandle : edge.targetHandle
    const remoteHandle = side === 'out' ? edge.targetHandle : edge.sourceHandle
    if (localId !== nodeId || localHandle !== handle) continue
    add(remoteId, remoteHandle)
  }

  if (here.node.type === 'sheetIn' && side === 'in') {
    add(here.node.data.remoteNodeId, here.node.data.remoteHandle)
  }
  if (here.node.type === 'sheetOut' && side === 'out') {
    add(here.node.data.remoteNodeId, here.node.data.remoteHandle)
  }

  return [...seen.values()]
}
