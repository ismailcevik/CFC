import type { NodeChange } from '@xyflow/react'
import { pinsForNode } from './blocks'
import { CFC, SHEET, cfcBlockHeight } from './cfc'
import { HOP_PANEL_W, isHopPanel } from './hops'
import { clampSheetPosition, membersOfLane } from './sheets'
import type { AppEdge, AppNode } from './types'

export type Pt = { x: number; y: number }
export type Box = { x: number; y: number; w: number; h: number }

const NODE_GAP = 12
const SEARCH_STEP = 20
const SEARCH_MAX = 720

export function stepPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  laneX?: number,
  jog = 0,
): Pt[] {
  const offset = 18 + jog
  if (Math.abs(sourceY - targetY) < 0.6) {
    return [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ]
  }
  if (sourceX + 18 < targetX - 18) {
    const midX = (laneX ?? Math.round((sourceX + targetX) / 2)) + jog
    return [
      { x: sourceX, y: sourceY },
      { x: midX, y: sourceY },
      { x: midX, y: targetY },
      { x: targetX, y: targetY },
    ]
  }
  const midY = Math.round((sourceY + targetY) / 2) + jog
  return [
    { x: sourceX, y: sourceY },
    { x: sourceX + offset, y: sourceY },
    { x: sourceX + offset, y: midY },
    { x: targetX - offset, y: midY },
    { x: targetX - offset, y: targetY },
    { x: targetX, y: targetY },
  ]
}

export function nodeSize(node: AppNode): { w: number; h: number } {
  if (node.type === 'note') {
    return {
      w: styleSize(node.style?.width, 220),
      h: styleSize(node.style?.height, 96),
    }
  }
  if (node.type === 'sheetIn' || node.type === 'sheetOut') {
    return { w: SHEET.width, h: SHEET.height }
  }
  if (node.type === 'sheetLane') {
    return {
      w: styleSize(node.style?.width, SHEET.width + 28),
      h: styleSize(node.style?.height, 480),
    }
  }
  if (isHopPanel(node)) {
    return {
      w: styleSize(node.style?.width, HOP_PANEL_W),
      h: styleSize(node.style?.height, 80),
    }
  }
  const pins = pinsForNode(node)
  const rows = Math.max(1, ...pins.map((pin) => pin.row + 1))
  return { w: CFC.width, h: cfcBlockHeight(rows) }
}

export function nodeBox(node: AppNode, position = node.position, _edges?: AppEdge[]): Box {
  const size = nodeSize(node)
  return { x: position.x, y: position.y, w: size.w, h: size.h }
}

function isSheet(node: { type?: string | null }) {
  return node.type === 'sheetIn' || node.type === 'sheetOut'
}

function isLane(node: { type?: string | null }) {
  return node.type === 'sheetLane'
}

function expandAttachedDrags(nodes: AppNode[], changes: NodeChange<AppNode>[]): NodeChange<AppNode>[] {
  const extras: NodeChange<AppNode>[] = []
  const seen = new Set(
    changes.filter((change) => change.type === 'position').map((change) => change.id),
  )
  for (const change of changes) {
    if (change.type !== 'position' || !change.position) continue
    const node = nodes.find((item) => item.id === change.id)
    if (!node) continue
    const dx = change.position.x - node.position.x
    const dy = change.position.y - node.position.y
    if (dx === 0 && dy === 0) continue
    const attached = isLane(node)
      ? membersOfLane(node, nodes)
      : isHopPanel(node)
        ? []
        : nodes.filter((item) => isHopPanel(item) && item.data.remoteNodeId === node.id)
    for (const member of attached) {
      if (seen.has(member.id)) continue
      extras.push({
        type: 'position',
        id: member.id,
        position: { x: member.position.x + dx, y: member.position.y + dy },
        dragging: change.dragging,
      })
      seen.add(member.id)
    }
  }
  return extras.length ? [...changes, ...extras] : changes
}

function positionMap(nodes: AppNode[], changes: NodeChange<AppNode>[]) {
  const next = new Map(nodes.map((node) => [node.id, node.position]))
  for (const change of changes) {
    if (change.type === 'position' && change.position) next.set(change.id, change.position)
  }
  return next
}

function lockPositionChange(
  nodes: AppNode[],
  change: Extract<NodeChange<AppNode>, { type: 'position' }>,
  proposed: Map<string, Pt>,
): Extract<NodeChange<AppNode>, { type: 'position' }> {
  const node = nodes.find((item) => item.id === change.id)
  if (!node || !change.position) return change
  if (isLane(node)) return { ...change, position: snap(change.position) }
  if (isSheet(node)) return { ...change, position: clampSheetPosition(node, nodes, change.position, proposed) }
  return change
}

export function nodeFits(node: AppNode, others: AppNode[], edges?: AppEdge[]): boolean {
  if (isHopPanel(node)) return true
  const box = nodeBox(node, node.position, edges)
  if (isSheet(node)) {
    for (const other of others) {
      if (other.id === node.id || other.type !== node.type) continue
      if (boxesOverlap(box, nodeBox(other, other.position, edges), NODE_GAP)) return false
    }
    return true
  }
  if (isLane(node)) {
    for (const other of others) {
      if (other.id === node.id || isSheet(other)) continue
      if (boxesOverlap(box, nodeBox(other, other.position, edges), NODE_GAP)) return false
    }
    return true
  }
  for (const other of others) {
    if (other.id === node.id || isHopPanel(other)) continue
    if (boxesOverlap(box, nodeBox(other, other.position, edges), NODE_GAP)) return false
  }
  return true
}

export function placementOk(nodes: AppNode[], edges: AppEdge[], movingIds?: Set<string>): boolean {
  const moving = movingIds ? nodes.filter((node) => movingIds.has(node.id)) : nodes
  for (const node of moving) {
    if (!nodeFits(node, nodes, edges)) return false
  }
  return true
}

export function findClearPosition(
  node: AppNode,
  desired: Pt,
  others: AppNode[],
  edges: AppEdge[],
): Pt {
  const start = snap(desired)
  if (fits(node, start, others, edges)) return start
  for (let radius = SEARCH_STEP; radius <= SEARCH_MAX; radius += SEARCH_STEP) {
    for (let dx = -radius; dx <= radius; dx += SEARCH_STEP) {
      const top = snap({ x: desired.x + dx, y: desired.y - radius })
      if (fits(node, top, others, edges)) return top
      const bottom = snap({ x: desired.x + dx, y: desired.y + radius })
      if (fits(node, bottom, others, edges)) return bottom
    }
    for (let dy = -radius + SEARCH_STEP; dy <= radius - SEARCH_STEP; dy += SEARCH_STEP) {
      const left = snap({ x: desired.x - radius, y: desired.y + dy })
      if (fits(node, left, others, edges)) return left
      const right = snap({ x: desired.x + radius, y: desired.y + dy })
      if (fits(node, right, others, edges)) return right
    }
  }
  return start
}

export function findClearGroupOffset(group: AppNode[], others: AppNode[], edges: AppEdge[]): Pt {
  const rest = others.filter((node) => !group.some((item) => item.id === node.id))
  const tryOffset = (dx: number, dy: number) => {
    const moved = group.map((node) => ({
      ...node,
      position: { x: node.position.x + dx, y: node.position.y + dy },
    }))
    return placementOk([...rest, ...moved], edges, new Set(moved.map((node) => node.id)))
  }
  if (tryOffset(0, 0)) return { x: 0, y: 0 }
  for (let radius = SEARCH_STEP; radius <= SEARCH_MAX; radius += SEARCH_STEP) {
    for (let dx = -radius; dx <= radius; dx += SEARCH_STEP) {
      if (tryOffset(dx, -radius)) return { x: dx, y: -radius }
      if (tryOffset(dx, radius)) return { x: dx, y: radius }
    }
    for (let dy = -radius + SEARCH_STEP; dy <= radius - SEARCH_STEP; dy += SEARCH_STEP) {
      if (tryOffset(-radius, dy)) return { x: -radius, y: dy }
      if (tryOffset(radius, dy)) return { x: radius, y: dy }
    }
  }
  return { x: 0, y: 0 }
}

export function constrainNodeChanges(
  nodes: AppNode[],
  edges: AppEdge[],
  changes: NodeChange<AppNode>[],
): NodeChange<AppNode>[] {
  const dimBlocked = changes.some((change) => {
    if (change.type !== 'dimensions' || !change.dimensions) return false
    const node = nodes.find((item) => item.id === change.id)
    if (!node) return false
    const next = nodes.map((item) =>
      item.id === node.id
        ? { ...item, style: { ...item.style, width: change.dimensions?.width, height: change.dimensions?.height } }
        : item,
    )
    return !placementOk(next, edges, new Set([node.id]))
  })
  const withoutBadSize = dimBlocked ? changes.filter((change) => change.type !== 'dimensions') : changes

  const expanded = expandAttachedDrags(nodes, withoutBadSize)
  const proposed = positionMap(nodes, expanded)
  const locked = expanded.map((change) =>
    change.type === 'position' ? lockPositionChange(nodes, change, proposed) : change,
  )
  const posChanges = locked.filter(
    (change): change is Extract<NodeChange<AppNode>, { type: 'position' }> =>
      change.type === 'position' && Boolean(change.position),
  )
  if (posChanges.length === 0) return locked

  const dragging = posChanges.some((change) => change.dragging)
  if (dragging) return locked

  const laneMoves = posChanges.filter((change) => {
    const node = nodes.find((item) => item.id === change.id)
    return Boolean(node && isLane(node))
  })
  let nextLocked = locked
  for (const move of laneMoves) {
    const lane = nodes.find((item) => item.id === move.id)
    if (!lane || !move.position) continue
    const members = membersOfLane(lane, nodes)
    const groupIds = new Set([lane.id, ...members.map((item) => item.id)])
    const applied = applyPositions(
      nodes,
      nextLocked.flatMap((change) =>
        change.type === 'position' && change.position ? [{ id: change.id, position: change.position }] : [],
      ),
    )
    const group = applied.filter((item) => groupIds.has(item.id))
    const others = applied.filter((item) => !groupIds.has(item.id))
    const offset = findClearGroupOffset(group, others, edges)
    if (offset.x === 0 && offset.y === 0) continue
    nextLocked = nextLocked.map((change) =>
      change.type === 'position' && change.position && groupIds.has(change.id)
        ? { ...change, position: { x: change.position.x + offset.x, y: change.position.y + offset.y } }
        : change,
    )
  }

  const workMoves = posChanges.filter((change) => {
    const node = nodes.find((item) => item.id === change.id)
    return node != null && !isSheet(node) && !isLane(node) && !isHopPanel(node)
  })
  if (workMoves.length > 1) {
    const proposedWork = applyPositions(
      nodes,
      workMoves.flatMap((change) => (change.position ? [{ id: change.id, position: change.position }] : [])),
    )
    if (placementOk(proposedWork, edges, new Set(workMoves.map((item) => item.id)))) {
      return nextLocked
    }
    return nextLocked.filter((change) => change.type !== 'position' || !workMoves.some((item) => item.id === change.id))
  }

  if (workMoves.length === 1) {
    const change = workMoves[0]
    if (!change.position) return nextLocked
    const node = nodes.find((item) => item.id === change.id)
    if (!node) return nextLocked
    const others = applyPositions(
      nodes,
      nextLocked.flatMap((item) =>
        item.type === 'position' && item.position && item.id !== node.id ? [{ id: item.id, position: item.position }] : [],
      ),
    ).filter((item) => item.id !== node.id)
    const free = findClearPosition(node, change.position, others, edges)
    return nextLocked.map((item) =>
      item.type === 'position' && item.id === change.id ? { ...item, position: free } : item,
    )
  }

  return nextLocked
}

function applyPositions(nodes: AppNode[], changes: { id: string; position: Pt }[]) {
  const next = new Map(changes.map((change) => [change.id, change.position]))
  return nodes.map((node) => {
    const position = next.get(node.id)
    return position ? { ...node, position } : node
  })
}

function fits(node: AppNode, position: Pt, others: AppNode[], edges: AppEdge[]) {
  return nodeFits({ ...node, position }, others, edges)
}

function boxesOverlap(a: Box, b: Box, gap: number) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

function styleSize(value: number | string | undefined, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function snap(point: Pt): Pt {
  return { x: Math.round(point.x / 4) * 4, y: Math.round(point.y / 4) * 4 }
}
