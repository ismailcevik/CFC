import { blockById, pinsForNode } from './blocks'
import { defaultNodeData } from './catalog'
import { CFC, SHEET, cfcBlockHeight, cfcPinTop } from './cfc'
import { PORT } from './ports'
import { portKindOf } from './ports'
import type { AppEdge, AppNode, PortKind, WorkPage } from './types'
import { isHopPanel } from './hops'
import { pageOfNode } from './xref'

const LIST_W = SHEET.width
const ROW = SHEET.height + 16
const GUTTER = 48
const PAGE_LEFT = 24
const PAGE_TOP = 72
const LANE_INSET = 14
const LANE_HEADER = 40
const SHEET_GAP = 16

export function isSheetLane(node: { type?: string | null }): boolean {
  return node.type === 'sheetLane'
}

export function isSheetChrome(node: { type?: string | null }): boolean {
  return isSheetNode(node) || isSheetLane(node)
}

export function sheetGutters(nodes: AppNode[]) {
  const blocks = nodes.filter((node) => !isSheetChrome(node) && !isHopPanel(node))
  const workRight = blocks.length
    ? Math.max(...blocks.map((node) => node.position.x + (node.type === 'note' ? 220 : CFC.width)))
    : 400
  return {
    leftX: PAGE_LEFT,
    rightX: Math.max(PAGE_LEFT + LIST_W + GUTTER + 720, workRight + GUTTER),
  }
}

export function workBand(nodes: AppNode[]) {
  const { leftX, rightX } = sheetGutters(nodes)
  return {
    minX: leftX + LIST_W + GUTTER,
    maxX: rightX - GUTTER,
  }
}

export function isSheetNode(node: { type?: string | null }): boolean {
  return node.type === 'sheetIn' || node.type === 'sheetOut'
}

export function laneKind(node: { type?: string | null; data?: { label?: string } }): 'in' | 'out' | null {
  if (node.type === 'sheetIn' || (node.type === 'sheetLane' && node.data?.label === 'Gelen')) return 'in'
  if (node.type === 'sheetOut' || (node.type === 'sheetLane' && node.data?.label === 'Giden')) return 'out'
  return null
}

export function laneForNode(node: AppNode, nodes: AppNode[]) {
  const kind = laneKind(node)
  if (!kind) return undefined
  return nodes.find((item) => item.type === 'sheetLane' && laneKind(item) === kind)
}

export function membersOfLane(lane: AppNode, nodes: AppNode[]) {
  const type = laneKind(lane) === 'in' ? 'sheetIn' : 'sheetOut'
  return nodes.filter((node) => node.type === type)
}

export function clampSheetPosition(
  node: AppNode,
  nodes: AppNode[],
  desired: { x: number; y: number },
  proposed?: Map<string, { x: number; y: number }>,
) {
  const posOf = (item: AppNode) => proposed?.get(item.id) ?? item.position
  const lane = laneForNode(node, nodes)
  const lanePos = lane ? posOf(lane) : { x: node.type === 'sheetIn' ? PAGE_LEFT - LANE_INSET : sheetGutters(nodes).rightX - LANE_INSET, y: 8 }
  const siblings = nodes
    .filter((item) => item.type === node.type && item.id !== node.id)
    .map((item) => ({ ...item, position: posOf(item) }))
  return {
    x: lanePos.x + LANE_INSET,
    y: separateSheetY(desired.y, lanePos.y, siblings),
  }
}

export function separateSheetY(desiredY: number, laneY: number, siblings: AppNode[]) {
  const minY = laneY + LANE_HEADER
  let y = Math.max(minY, Math.round(desiredY / 4) * 4)
  const others = [...siblings].sort((a, b) => a.position.y - b.position.y)
  for (let pass = 0; pass < 48; pass += 1) {
    const hit = others.find((item) => Math.abs(item.position.y - y) < SHEET.height + SHEET_GAP)
    if (!hit) break
    const goDown = y + SHEET.height / 2 >= hit.position.y + SHEET.height / 2
    y = goDown ? hit.position.y + SHEET.height + SHEET_GAP : hit.position.y - SHEET.height - SHEET_GAP
    if (y < minY) y = hit.position.y + SHEET.height + SHEET_GAP
    y = Math.round(y / 4) * 4
  }
  return y
}

function laneHeight(laneY: number, sheets: AppNode[]) {
  if (sheets.length === 0) return 480
  return Math.max(480, ...sheets.map((node) => node.position.y + SHEET.height + 16 - laneY))
}

function workSize(node: AppNode) {
  if (node.type === 'note') return { w: 220, h: 96 }
  const pins = pinsForNode(node)
  const rows = Math.max(1, ...pins.map((pin) => pin.row + 1))
  return { w: CFC.width, h: cfcBlockHeight(rows) }
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap: number,
) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

function unoverlapWork(nodes: AppNode[]): AppNode[] {
  const work = nodes.filter((node) => !isSheetChrome(node))
  const positions = new Map(work.map((node) => [node.id, { ...node.position }]))
  const sorted = [...work].sort((a, b) => {
    const ap = positions.get(a.id)!
    const bp = positions.get(b.id)!
    return ap.y - bp.y || ap.x - bp.x
  })
  for (let i = 0; i < sorted.length; i += 1) {
    const node = sorted[i]
    const size = workSize(node)
    let pos = positions.get(node.id)!
    for (let guard = 0; guard < 40; guard += 1) {
      const box = { x: pos.x, y: pos.y, w: size.w, h: size.h }
      const hit = sorted.slice(0, i).find((other) => {
        const op = positions.get(other.id)!
        const os = workSize(other)
        return boxesOverlap(box, { x: op.x, y: op.y, w: os.w, h: os.h }, 12)
      })
      if (!hit) break
      const hp = positions.get(hit.id)!
      const hs = workSize(hit)
      pos = { x: pos.x, y: Math.round((hp.y + hs.h + 12) / 4) * 4 }
    }
    positions.set(node.id, pos)
  }
  return nodes.map((node) => {
    const next = positions.get(node.id)
    if (!next || (next.x === node.position.x && next.y === node.position.y)) return node
    return { ...node, position: next }
  })
}

function nudgeOffChrome(node: AppNode, chrome: AppNode[]) {
  const { w: width, h: height } = workSize(node)
  const overlaps = (x: number, y: number) =>
    chrome.some((item) => {
      const boxW = item.type === 'sheetLane' ? LIST_W + 28 : SHEET.width
      const boxH = item.type === 'sheetLane' ? Number(item.style?.height) || 480 : SHEET.height
      return (
        x < item.position.x + boxW + 16 &&
        x + width + 16 > item.position.x &&
        y < item.position.y + boxH + 16 &&
        y + height + 16 > item.position.y
      )
    })
  if (!overlaps(node.position.x, node.position.y)) return node
  const startX = node.position.x
  for (let dx = 20; dx <= 800; dx += 20) {
    if (!overlaps(startX + dx, node.position.y)) {
      return { ...node, position: { ...node.position, x: startX + dx } }
    }
    if (!overlaps(startX - dx, node.position.y)) {
      return { ...node, position: { ...node.position, x: startX - dx } }
    }
  }
  return node
}

function kindPorts(kind: PortKind) {
  if (kind === 'time') return { out: PORT.timeOut, in: PORT.timeIn }
  if (kind === 'bool') return { out: PORT.boolOut, in: PORT.boolIn }
  return { out: PORT.signalOut, in: PORT.signalIn }
}

function token(parts: string[]) {
  return parts.join('_').replace(/[^a-zA-Z0-9._-]/g, '-')
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }
  return [...groups.values()]
}

function connectedPinY(node: AppNode, handle: string | undefined, side: 'in' | 'out') {
  const pins = pinsForNode(node)
  const pin = pins.find((item) => item.id === handle) ?? pins.find((item) => item.side === side)
  return node.position.y + cfcPinTop(pin?.row ?? 0)
}

function takeSlot(preferred: number, used: number[], minY = PAGE_TOP) {
  let y = Math.max(minY, Math.round(preferred / 4) * 4)
  while (used.some((slot) => Math.abs(slot - y) < SHEET.height + SHEET_GAP)) y += SHEET.height + SHEET_GAP
  used.push(y)
  return y
}

function isSheetEdge(edge: AppEdge) {
  return (
    edge.className === 'sheet-edge' ||
    edge.source.startsWith('sheet-') ||
    edge.target.startsWith('sheet-')
  )
}

export function syncSheetLists(pages: WorkPage[]): WorkPage[] {
  return pages.map((page) => ({
    ...page,
    nodes: page.nodes.filter((node) => !isSheetChrome(node)),
    edges: page.edges.filter((edge) => !isSheetEdge(edge)),
  }))
}

export function disconnectVisualEdges(pages: WorkPage[], visuals: AppEdge[]): WorkPage[] {
  const owner = new Map<string, string>()
  for (const page of pages) {
    for (const node of page.nodes) {
      if (!isSheetChrome(node)) owner.set(node.id, page.id)
    }
  }

  return pages.map((page) => ({
    ...page,
    edges: page.edges.filter((edge) => {
      for (const visual of visuals) {
        const sheet =
          page.nodes.find((node) => node.id === visual.source || node.id === visual.target) ??
          pages.flatMap((item) => item.nodes).find((node) => node.id === visual.source || node.id === visual.target)
        if (!sheet || !isSheetNode(sheet)) continue
        if (sheet.type === 'sheetIn') {
          if (
            edge.source === sheet.data.remoteNodeId &&
            edge.target === visual.target &&
            (edge.targetHandle ?? '') === (visual.targetHandle ?? '')
          ) {
            return false
          }
        }
        if (sheet.type === 'sheetOut') {
          const destPage = owner.get(edge.target)
          if (
            edge.source === visual.source &&
            (edge.sourceHandle ?? '') === (visual.sourceHandle ?? '') &&
            destPage === sheet.data.remotePageId
          ) {
            return false
          }
        }
      }
      return true
    }),
  }))
}

export function sheetSignature(pages: WorkPage[]) {
  return pages
    .map((page) => {
      const items = page.nodes
        .filter(isSheetNode)
        .map((node) => `${node.id}:${Math.round(node.position.y)}:${node.data.label}:${node.data.busName}:${node.data.remoteNodeId}:${node.data.remoteHandle}`)
        .sort()
        .join(',')
      const arrows = page.edges
        .filter((edge) => page.nodes.some((node) => isSheetNode(node) && (node.id === edge.source || node.id === edge.target)))
        .map((edge) => edge.id)
        .sort()
        .join(',')
      const lanes = page.nodes
        .filter(isSheetLane)
        .map((node) => `${node.id}:${Math.round(node.position.x)}:${Math.round(node.position.y)}:${Math.round(Number(node.style?.height) || 0)}`)
        .sort()
        .join(',')
      return `${page.id}:v11:${ROW}:${CFC.rowH}:${CFC.width}:${lanes}:${items}:${arrows}`
    })
    .join('|')
}

export function pinSheetColumns(nodes: AppNode[]): AppNode[] {
  return nodes.map((node) => {
    if (!isSheetNode(node)) return node
    const next = clampSheetPosition(node, nodes, node.position)
    if (next.x === node.position.x && next.y === node.position.y) return node
    return { ...node, position: next }
  })
}

export function dockSheetLists(
  nodes: AppNode[],
  toFlow?: (point: { x: number; y: number }) => { x: number; y: number },
) {
  if (!toFlow || typeof document === 'undefined') return pinSheetColumns(nodes)
  const pane = document.querySelector('.react-flow')
  if (!pane) return pinSheetColumns(nodes)
  const rect = pane.getBoundingClientRect()
  if (rect.width < 80) return pinSheetColumns(nodes)
  const leftX = Math.round(toFlow({ x: rect.left + 16, y: rect.top + 48 }).x)
  const rightX = Math.round(toFlow({ x: rect.right - LIST_W - 16, y: rect.top + 48 }).x)
  let changed = false
  const next = nodes.map((node) => {
    if (node.type === 'sheetIn' && Math.round(node.position.x) !== leftX) {
      changed = true
      return { ...node, position: { x: leftX, y: node.position.y } }
    }
    if (node.type === 'sheetOut' && Math.round(node.position.x) !== rightX) {
      changed = true
      return { ...node, position: { x: rightX, y: node.position.y } }
    }
    return node
  })
  return changed ? next : nodes
}

export function sheetJumpTarget(pages: WorkPage[], node: AppNode) {
  if (!isSheetNode(node) || !node.data.remoteNodeId) return null
  const page = pages.find((item) => item.id === node.data.remotePageId) ?? pageOfNode(pages, node.data.remoteNodeId)
  if (!page) return null
  const remote = page.nodes.find((item) => item.id === node.data.remoteNodeId)
  const pin = remote ? pinsForNode(remote).find((item) => item.id === node.data.remoteHandle) : undefined
  return {
    pageId: page.id,
    pageName: page.name,
    nodeId: node.data.remoteNodeId,
    handle: node.data.remoteHandle,
    label: node.data.label,
    pinLabel: pin?.label ?? '',
    fbType: remote ? blockById(remote.type ?? 'signal').fbType : '',
    samePage: false,
  }
}
