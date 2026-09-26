import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useStore,
  type ConnectionLineComponentProps,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { CFC_HOP_PIN_SNAP } from './cfc'
import { stepPoints, type Pt } from './placement'
import { portKindOf } from './ports'
import type { AppEdge, AppNode, PortKind } from './types'

const HOP = 7
const MIN_GAP = 12
const LANE_GAP = 12

type HoverNet = {
  edgeId: string | null
  sourceId: string | null
  targetId: string | null
  sourceHandle: string | null
  targetHandle: string | null
  set: (
    edgeId: string | null,
    sourceId?: string | null,
    targetId?: string | null,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => void
}

const HoverNetContext = createContext<HoverNet>({
  edgeId: null,
  sourceId: null,
  targetId: null,
  sourceHandle: null,
  targetHandle: null,
  set: () => undefined,
})

export function useWireTrace() {
  return useContext(HoverNetContext)
}

export function EdgeHoverProvider({ children }: { children: ReactNode }) {
  const [edgeId, setEdgeId] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [sourceHandle, setSourceHandle] = useState<string | null>(null)
  const [targetHandle, setTargetHandle] = useState<string | null>(null)
  const value = useMemo<HoverNet>(
    () => ({
      edgeId,
      sourceId,
      targetId,
      sourceHandle,
      targetHandle,
      set: (nextEdge, nextSource = null, nextTarget = null, nextSourceHandle = null, nextTargetHandle = null) => {
        setEdgeId(nextEdge)
        setSourceId(nextSource)
        setTargetId(nextTarget)
        setSourceHandle(nextSourceHandle)
        setTargetHandle(nextTargetHandle)
      },
    }),
    [edgeId, sourceHandle, sourceId, targetHandle, targetId],
  )
  return <HoverNetContext.Provider value={value}>{children}</HoverNetContext.Provider>
}

const KIND_COLOR: Record<PortKind, string> = {
  signal: '#2f7fd4',
  time: '#c4921a',
  bool: '#2e8b57',
}

export const edgeTypes = {
  cfc: CfcEdge,
  step: CfcEdge,
}

export function CfcConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  fromHandle,
}: ConnectionLineComponentProps) {
  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    borderRadius: 0,
    offset: 16,
  })
  const kind = portKindOf(fromHandle?.id)
  return (
    <path
      className="cfc-wire-draft"
      d={path}
      fill="none"
      stroke={kind ? KIND_COLOR[kind] : '#5a6d80'}
      strokeWidth={1.6}
      strokeDasharray="5 4"
    />
  )
}

function CfcEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceHandleId,
  targetHandleId,
  selected,
  style,
}: EdgeProps<AppEdge>) {
  const hover = useContext(HoverNetContext)
  const kind = portKindOf(sourceHandleId) ?? portKindOf(targetHandleId)
  const color = kind ? KIND_COLOR[kind] : '#4a5d70'
  const points = useStore((state) => {
    const src = state.nodeLookup.get(source)
    const tgt = state.nodeLookup.get(target)
    if (isHopIncoming(src, tgt, sourceHandleId)) {
      const end = handleCenter(tgt!, targetHandleId, 'target')
      const tx = (Number.isFinite(end.x) ? end.x : targetX) + CFC_HOP_PIN_SNAP
      const ty = Number.isFinite(end.y) ? end.y : targetY
      const start = hopPanelHandlePoint(src!, sourceHandleId, 'source', sourceX, sourceY)
      return hopInPoints(start.x, start.y, tx, ty)
    }
    if (isHopOutgoing(src, tgt, targetHandleId)) {
      const start = handleCenter(src!, sourceHandleId, 'source')
      const end = hopPanelHandlePoint(tgt!, targetHandleId, 'target', targetX, targetY)
      const sx = Number.isFinite(start.x) ? start.x : sourceX
      const sy = Number.isFinite(start.y) ? start.y : sourceY
      return hopOutPoints(sx, sy, end.x, end.y)
    }
    return routePoints(
      id,
      sourceX,
      sourceY,
      targetX,
      targetY,
      src?.type,
      tgt?.type,
      storeEdges(state),
      state.nodeLookup,
    )
  })
  const crossings = useStore((state) =>
    id.startsWith('hop-e-') ? [] : collectHops(id, points, storeEdges(state), state.nodeLookup),
  )
  const traced = useStore((state) => {
    const src = state.nodeLookup.get(source)
    const tgt = state.nodeLookup.get(target)
    return Boolean(src?.selected || tgt?.selected)
  })
  const related = hover.sourceId === source && hover.edgeId !== id
  const hovered = hover.edgeId === id
  const dimmed = Boolean(hover.edgeId && hover.edgeId !== id)
  const active = selected || traced || hovered || related
  const path = pathWithHops(points, crossings)
  const labels = useStore((state) => {
    const src = state.nodeLookup.get(source) as InternalNode<AppNode> | undefined
    const tgt = state.nodeLookup.get(target) as InternalNode<AppNode> | undefined
    return {
      source: nodeTitle(src),
      target: nodeTitle(tgt),
    }
  })

  return (
    <g
      className={`cfc-wire kind-${kind ?? 'signal'}${active ? ' is-active' : ''}${dimmed ? ' is-dim' : ''}`}
      onPointerEnter={() => hover.set(id, source, target, sourceHandleId, targetHandleId)}
      onPointerLeave={() => hover.set(null)}
    >
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          stroke: color,
          strokeWidth: hovered ? 3.2 : active ? 2.4 : 1.6,
        }}
        interactionWidth={22}
      />
      {dots(points, color, active || hovered)}
      {crossings.map((hop, index) => (
        <circle
          key={`${hop.x}-${hop.y}-${index}`}
          className="cfc-wire-hop-dot"
          cx={hop.x}
          cy={hop.y - HOP}
          r={1.4}
          fill={color}
        />
      ))}
      {hovered ? (
        <EdgeLabelRenderer>
          <div
            className="cfc-wire-badge is-out"
            style={{
              transform: `translate(10px, -120%) translate(${sourceX}px, ${sourceY}px)`,
              borderColor: color,
            }}
          >
            <small>ÇIKIŞ</small>
            {labels.source}
          </div>
          <div
            className="cfc-wire-label"
            style={{
              transform: `translate(-50%, -160%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
              borderColor: color,
            }}
          >
            {labels.source} → {labels.target}
          </div>
          <div
            className="cfc-wire-badge is-in"
            style={{
              transform: `translate(calc(-100% - 10px), -120%) translate(${targetX}px, ${targetY}px)`,
              borderColor: color,
            }}
          >
            <small>GİRİŞ</small>
            {labels.target}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  )
}

function nodeTitle(node?: InternalNode<AppNode>) {
  if (!node) return ''
  const label = node.data.label
  if ((node.type === 'sheetIn' || node.type === 'sheetOut') && node.data.busName) {
    return `${label} · s.${node.data.busName}`
  }
  return label
}

function collectHops(
  id: string,
  points: Pt[],
  edges: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[],
  nodeLookup: Map<string, InternalNode>,
): Pt[] {
  const hops: Pt[] = []
  const seen = new Set<string>()
  for (const edge of edges) {
    if (edge.id === id) continue
    const src = nodeLookup.get(edge.source)
    const tgt = nodeLookup.get(edge.target)
    if (!src || !tgt) continue
    const start = handleCenter(src, edge.sourceHandle, 'source')
    const end = handleCenter(tgt, edge.targetHandle, 'target')
    const other = routePoints(edge.id, start.x, start.y, end.x, end.y, src.type, tgt.type, edges, nodeLookup)
    for (const hop of crossings(points, other)) {
      const key = `${hop.x.toFixed(1)}:${hop.y.toFixed(1)}`
      if (seen.has(key)) continue
      seen.add(key)
      hops.push(hop)
    }
  }
  return hops
}

function storeEdges(state: {
  edges?: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[]
  edgeLookup?: Map<string, { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>
}) {
  if (state.edgeLookup && state.edgeLookup.size > 0) return [...state.edgeLookup.values()]
  return Array.isArray(state.edges) ? state.edges : []
}

function isHopIncoming(
  src: InternalNode | undefined,
  tgt: InternalNode | undefined,
  sourceHandleId?: string | null,
) {
  return (
    src?.type === 'hopPanel' &&
    tgt != null &&
    tgt.type !== 'hopPanel' &&
    Boolean(sourceHandleId?.startsWith('hop-'))
  )
}

function isHopOutgoing(
  src: InternalNode | undefined,
  tgt: InternalNode | undefined,
  targetHandleId?: string | null,
) {
  return (
    src != null &&
    src.type !== 'hopPanel' &&
    tgt?.type === 'hopPanel' &&
    Boolean(targetHandleId?.startsWith('hop-'))
  )
}

function hopWirePoints(sourceX: number, sourceY: number, targetX: number, targetY: number): Pt[] {
  const dy = Math.abs(sourceY - targetY)
  if (dy < 3 && sourceX + 4 < targetX) {
    return [
      { x: sourceX, y: targetY },
      { x: targetX, y: targetY },
    ]
  }
  if (sourceX + 18 < targetX - 18) {
    const midX = Math.round((sourceX + targetX) / 2)
    return [
      { x: sourceX, y: sourceY },
      { x: midX, y: sourceY },
      { x: midX, y: targetY },
      { x: targetX, y: targetY },
    ]
  }
  return stepPoints(sourceX, sourceY, targetX, targetY)
}

function hopInPoints(sourceX: number, sourceY: number, targetX: number, targetY: number): Pt[] {
  return hopWirePoints(sourceX, sourceY, targetX, targetY)
}

function hopOutPoints(sourceX: number, sourceY: number, targetX: number, targetY: number): Pt[] {
  return hopWirePoints(sourceX, sourceY, targetX, targetY)
}

function routePoints(
  id: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceType: string | undefined,
  targetType: string | undefined,
  edges: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[],
  nodeLookup: Map<string, InternalNode>,
) {
  const base = sheetLane(sourceX, targetX, sourceType, targetType)
  const forward = sourceX + 18 < targetX - 18
  const key = corridorKey(sourceX, targetX, sourceType, targetType)
  const pack: { id: string; y: number }[] = []
  const list = Array.isArray(edges) ? edges : []
  for (const edge of list) {
    const src = nodeLookup.get(edge.source)
    const tgt = nodeLookup.get(edge.target)
    if (!src || !tgt) continue
    const start = handleCenter(src, edge.sourceHandle, 'source')
    const end = handleCenter(tgt, edge.targetHandle, 'target')
    if (corridorKey(start.x, end.x, src.type, tgt.type) !== key) continue
    pack.push({ id: edge.id, y: (start.y + end.y) / 2 })
  }
  if (!pack.some((item) => item.id === id)) {
    pack.push({ id, y: (sourceY + targetY) / 2 })
  }
  pack.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
  const index = Math.max(0, pack.findIndex((item) => item.id === id))
  const shift = (index - Math.max(pack.length - 1, 0) / 2) * LANE_GAP
  if (forward) return stepPoints(sourceX, sourceY, targetX, targetY, (base ?? Math.round((sourceX + targetX) / 2)) + shift)
  return stepPoints(sourceX, sourceY, targetX, targetY, base, shift)
}

function corridorKey(
  sourceX: number,
  targetX: number,
  sourceType?: string,
  targetType?: string,
) {
  const sourceSheet = sourceType === 'sheetIn' || sourceType === 'sheetOut'
  const targetSheet = targetType === 'sheetIn' || targetType === 'sheetOut'
  if (targetSheet) return 'sheet-out'
  if (sourceSheet) return 'sheet-in'
  const forward = sourceX + 18 < targetX - 18
  return `${forward ? 'f' : 'b'}:${Math.round((sourceX + targetX) / 80) * 80}`
}

function sheetLane(
  sourceX: number,
  targetX: number,
  sourceType?: string,
  targetType?: string,
) {
  const sourceSheet = sourceType === 'sheetIn' || sourceType === 'sheetOut'
  const targetSheet = targetType === 'sheetIn' || targetType === 'sheetOut'
  if (!sourceSheet && !targetSheet) return undefined
  if (targetSheet) return Math.round(targetX - 22)
  return Math.round(sourceX + 22)
}

function handleCenter(
  node: InternalNode,
  handleId: string | null | undefined,
  type: 'source' | 'target',
): Pt {
  const origin = node.internals.positionAbsolute
  const bounds = node.internals.handleBounds?.[type]
  const handle = bounds?.find((item) => (handleId ? item.id === handleId : true)) ?? bounds?.[0]
  if (!handle) {
    return { x: origin.x, y: origin.y }
  }
  return { x: origin.x + handle.x + handle.width / 2, y: origin.y + handle.y + handle.height / 2 }
}

function hopPanelHandlePoint(
  panel: InternalNode,
  handleId: string | null | undefined,
  type: 'source' | 'target',
  fallbackX: number,
  fallbackY: number,
): Pt {
  const bounds = panel.internals.handleBounds?.[type]
  const handle = bounds?.find((item) => (handleId ? item.id === handleId : true))
  if (handle) return handleCenter(panel, handleId, type)
  if (Number.isFinite(fallbackX) && Number.isFinite(fallbackY)) {
    return { x: fallbackX, y: fallbackY }
  }
  return handleCenter(panel, handleId, type)
}

function crossings(a: Pt[], b: Pt[]): Pt[] {
  const found: Pt[] = []
  for (let i = 0; i < a.length - 1; i += 1) {
    const s1 = { a: a[i], b: a[i + 1] }
    if (!horizontal(s1.a, s1.b)) continue
    for (let j = 0; j < b.length - 1; j += 1) {
      const s2 = { a: b[j], b: b[j + 1] }
      if (!vertical(s2.a, s2.b)) continue
      const hit = intersectHV(s1.a, s1.b, s2.a, s2.b)
      if (hit) found.push(hit)
    }
  }
  return found
}

function horizontal(a: Pt, b: Pt) {
  return Math.abs(a.y - b.y) < 0.6 && Math.abs(a.x - b.x) > MIN_GAP
}

function vertical(a: Pt, b: Pt) {
  return Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) > MIN_GAP
}

function intersectHV(h1: Pt, h2: Pt, v1: Pt, v2: Pt): Pt | null {
  const y = (h1.y + h2.y) / 2
  const x = (v1.x + v2.x) / 2
  const x0 = Math.min(h1.x, h2.x) + MIN_GAP
  const x1 = Math.max(h1.x, h2.x) - MIN_GAP
  const y0 = Math.min(v1.y, v2.y) + MIN_GAP
  const y1 = Math.max(v1.y, v2.y) - MIN_GAP
  if (x <= x0 || x >= x1 || y <= y0 || y >= y1) return null
  return { x, y }
}

function pathWithHops(points: Pt[], hops: Pt[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (!horizontal(a, b)) {
      d += ` L ${b.x} ${b.y}`
      continue
    }
    const goingRight = b.x >= a.x
    const onSeg = hops
      .filter((hop) => Math.abs(hop.y - a.y) < 0.8 && hop.x > Math.min(a.x, b.x) + MIN_GAP && hop.x < Math.max(a.x, b.x) - MIN_GAP)
      .sort((p, q) => (goingRight ? p.x - q.x : q.x - p.x))
    for (const hop of onSeg) {
      const startX = goingRight ? hop.x - HOP : hop.x + HOP
      const endX = goingRight ? hop.x + HOP : hop.x - HOP
      d += ` L ${startX} ${hop.y}`
      d += ` A ${HOP} ${HOP} 0 0 ${goingRight ? 0 : 1} ${endX} ${hop.y}`
    }
    d += ` L ${b.x} ${b.y}`
  }
  return d
}

function dots(points: Pt[], color: string, active: boolean) {
  const marks: ReactNode[] = []
  points.forEach((point, index) => {
    const end = index === 0 || index === points.length - 1
    marks.push(
      <circle
        key={`p-${index}`}
        className={end ? 'cfc-wire-end' : 'cfc-wire-corner'}
        cx={point.x}
        cy={point.y}
        r={end ? 3 : 2}
        fill={color}
        stroke="#fff"
        strokeWidth={active ? 1.2 : 1}
      />,
    )
    if (index < points.length - 1) {
      const next = points[index + 1]
      const len = Math.hypot(next.x - point.x, next.y - point.y)
      if (len > 88) {
        const mid = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }
        marks.push(
          <rect
            key={`m-${index}`}
            className="cfc-wire-tick"
            x={mid.x - 2}
            y={mid.y - 2}
            width={4}
            height={4}
            fill={color}
            transform={`rotate(45 ${mid.x} ${mid.y})`}
          />,
        )
      }
    }
  })
  return marks
}
