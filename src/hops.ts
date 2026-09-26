import type { NodeChange } from '@xyflow/react'
import { pinsForNode } from './blocks'
import { defaultNodeData } from './catalog'
import { CFC, cfcPinTop } from './cfc'
import type { AppEdge, AppNode, WorkPage } from './types'
import { collectRoutes } from './xref'

export const HOP_PANEL_W = 320
export const HOP_CARD_H = 56
export const HOP_SECTION_HEAD = 18
export const HOP_SECTION_GAP = 16
export const HOP_PANEL_PAD = 8

export function isHopPanel(node: { type?: string | null }): boolean {
  return node.type === 'hopPanel'
}

/** Kutu / çoklu seçimde yalnızca birlikte seçilen bloğa bağlı hop panelleri seçilir. */
export function hopPanelRemovesForDeletedBlocks(
  nodes: AppNode[],
  removedIds: Set<string>,
): NodeChange<AppNode>[] {
  if (removedIds.size === 0) return []
  return nodes
    .filter((node) => isHopPanel(node) && removedIds.has(node.data.remoteNodeId))
    .map((node) => ({ type: 'remove' as const, id: node.id }))
}

export function filterHopPanelSelection(nodes: AppNode[], changes: NodeChange<AppNode>[]): NodeChange<AppNode>[] {
  const selectOn = changes.filter((change) => change.type === 'select' && change.selected)
  if (selectOn.length <= 1) return changes

  const selectedBlocks = new Set(
    nodes.filter((node) => node.selected && !isHopPanel(node)).map((node) => node.id),
  )
  for (const change of selectOn) {
    const node = nodes.find((item) => item.id === change.id)
    if (node && !isHopPanel(node)) selectedBlocks.add(node.id)
  }

  return changes.filter((change) => {
    if (change.type !== 'select' || !change.selected) return true
    const node = nodes.find((item) => item.id === change.id)
    if (!node || !isHopPanel(node)) return true
    const parentId = node.data.remoteNodeId
    return Boolean(parentId && selectedBlocks.has(parentId))
  })
}

export function isHopEdge(edge: AppEdge): boolean {
  return edge.id.startsWith('hop-e-') || edge.className === 'hop-edge'
}

export function hopPanelId(sourceId: string, side: 'in' | 'out' = 'out') {
  return `hop-${side}-${sourceId}`
}

export function hopHandleId(pinId: string) {
  return `hop-${pinId}`
}

export type HopSection = {
  pinId: string
  pinLabel: string
  pinKind: string
  row: number
  routes: ReturnType<typeof collectRoutes>
}

export function hopSectionsFor(pages: WorkPage[], node: AppNode, side: 'in' | 'out' = 'out'): HopSection[] {
  return pinsForNode(node)
    .filter((pin) => pin.side === side)
    .sort((a, b) => a.row - b.row)
    .map((pin) => ({
      pinId: pin.id,
      pinLabel: pin.label,
      pinKind: pin.kind,
      row: pin.row,
      routes: collectRoutes(pages, node.id, pin.id, side),
    }))
    .filter((section) => section.routes.length > 0)
}

export function disconnectRoute(
  pages: WorkPage[],
  nodeId: string,
  handle: string,
  side: 'in' | 'out',
  route: { nodeId: string; handle: string },
): WorkPage[] {
  return pages.map((page) => ({
    ...page,
    edges: page.edges.filter((edge) => {
      if (isHopEdge(edge)) return true
      if (side === 'out') {
        return !(
          edge.source === nodeId &&
          (edge.sourceHandle ?? '') === handle &&
          edge.target === route.nodeId &&
          (edge.targetHandle ?? '') === route.handle
        )
      }
      return !(
        edge.target === nodeId &&
        (edge.targetHandle ?? '') === handle &&
        edge.source === route.nodeId &&
        (edge.sourceHandle ?? '') === route.handle
      )
    }),
  }))
}

export function hopPanelHeight(sections: HopSection[]) {
  if (sections.length === 0) return HOP_PANEL_PAD * 2
  return (
    HOP_PANEL_PAD * 2 +
    sections.reduce((sum, section, index) => {
      const body = HOP_SECTION_HEAD + section.routes.length * HOP_CARD_H
      return sum + body + (index > 0 ? HOP_SECTION_GAP : 0)
    }, 0)
  )
}

export function hopSectionTop(sections: HopSection[], pinId: string) {
  let top = HOP_PANEL_PAD
  for (const section of sections) {
    if (section.pinId === pinId) return top + HOP_SECTION_HEAD / 2
    top += HOP_SECTION_HEAD + section.routes.length * HOP_CARD_H + HOP_SECTION_GAP
  }
  return top
}

/** Gelen hop: mavi/sarı kartın solundaki pin hizası (bölüm başlığının altı, ilk kart ortası). */
export function hopInSectionHandleTop(sections: HopSection[], pinId: string) {
  let top = HOP_PANEL_PAD
  for (const section of sections) {
    if (section.pinId === pinId) {
      return top + HOP_SECTION_HEAD + HOP_CARD_H / 2
    }
    top += HOP_SECTION_HEAD + section.routes.length * HOP_CARD_H + HOP_SECTION_GAP
  }
  return top
}

export function hopSignature(pages: WorkPage[]) {
  return pages
    .map((page) => {
      const panels = page.nodes
        .filter(isHopPanel)
        .map((node) => `${node.id}:${node.data.remoteNodeId}:${node.data.remoteHandle}:${Math.round(Number(node.style?.height) || 0)}`)
        .sort()
        .join(',')
      const arrows = page.edges
        .filter(isHopEdge)
        .map((edge) => edge.id)
        .sort()
        .join(',')
      return `${page.id}:${panels}:${arrows}`
    })
    .join('|')
}

export function syncHopPanels(pages: WorkPage[]): WorkPage[] {
  return pages.map((page) => {
    const work = page.nodes.filter((node) => !isHopPanel(node) && node.type !== 'sheetIn' && node.type !== 'sheetOut' && node.type !== 'sheetLane' && node.type !== 'note')
    const existing = page.nodes.filter(isHopPanel)
    const panels: AppNode[] = []
    const hopEdges: AppEdge[] = []

    for (const node of work) {
      for (const side of ['out', 'in'] as const) {
        const sections = hopSectionsFor(pages, node, side)
        if (sections.length === 0) continue
        const prev = existing.find(
          (item) =>
            item.data.remoteNodeId === node.id &&
            (item.data.remoteHandle === side || (side === 'out' && item.data.remoteHandle !== 'in')),
        )
        const height = hopPanelHeight(sections)
        const firstHandleTop =
          side === 'in'
            ? hopInSectionHandleTop(sections, sections[0].pinId)
            : hopSectionTop(sections, sections[0].pinId)
        const fallback = {
          x: side === 'out' ? node.position.x + CFC.width + 28 : node.position.x - HOP_PANEL_W - 28,
          y: node.position.y + cfcPinTop(sections[0].row) - firstHandleTop,
        }
        const panelId = hopPanelId(node.id, side)
        let position = prev?.position ?? fallback
        if (side === 'in' && prev) {
          const beside = Math.abs(prev.position.x - fallback.x) < 48
          const aligned = Math.abs(prev.position.y - fallback.y) < 100
          if (!beside || !aligned) position = fallback
        }
        panels.push({
          id: panelId,
          type: 'hopPanel',
          position,
          draggable: true,
          selectable: true,
          selected: prev?.selected ?? false,
          deletable: false,
          connectable: false,
          zIndex: 6,
          style: { width: HOP_PANEL_W, height },
          data: defaultNodeData('hopPanel', { label: node.data.label, remoteNodeId: node.id, remoteHandle: side }),
        })
        for (const section of sections) {
          hopEdges.push(
            side === 'out'
              ? {
                  id: `hop-e-out-${node.id}-${section.pinId}`,
                  source: node.id,
                  target: panelId,
                  sourceHandle: section.pinId,
                  targetHandle: hopHandleId(section.pinId),
                  type: 'cfc',
                  className: 'hop-edge',
                  zIndex: 2,
                }
              : {
                  id: `hop-e-in-${node.id}-${section.pinId}`,
                  source: panelId,
                  target: node.id,
                  sourceHandle: hopHandleId(section.pinId),
                  targetHandle: section.pinId,
                  type: 'cfc',
                  className: 'hop-edge',
                  zIndex: 2,
                },
          )
        }
      }
    }

    return {
      ...page,
      nodes: [...page.nodes.filter((node) => !isHopPanel(node)), ...panels],
      edges: [...page.edges.filter((edge) => !isHopEdge(edge)), ...hopEdges],
    }
  })
}
