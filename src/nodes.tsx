import { Handle, NodeResizer, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { BLOCKS, blockById, clampSampleWindow, pinsForNode, type IoPin } from './blocks'
import { SIGNAL_OPTIONS, TAM_SAYI_MODES } from './catalog'
import { CFC, SHEET, cfcBlockHeight, cfcPinTop } from './cfc'
import {
  formatPinValue,
  formatValue,
  livePinValue,
  livePinValueAtHandle,
  readNumericSource,
  resolveWiredNumeric,
} from './engine'
import { PORT } from './ports'
import { useRuntime, useWatch } from './runtime'
import type { AppNode, ToolId } from './types'
import { useXref, type XrefLink } from './xref'
import { hopHandleId, hopInSectionHandleTop, hopSectionTop } from './hops'
import { pinFromHandle, useWiring } from './wiring'

function PinCell({
  nodeId,
  pin,
  side,
  showFrom = true,
  fallbackLive,
}: {
  nodeId: string
  pin?: IoPin
  side: 'in' | 'out'
  showFrom?: boolean
  fallbackLive?: number | null
}) {
  const xref = useXref()
  const runtime = useRuntime()
  const wiring = useWiring()
  if (!pin) return <div className={`cfc-pin-cell is-${side}`} />

  const incoming = side === 'in' ? xref.routes(nodeId, pin.id, 'in')[0] : undefined
  const mirroredFark = runtime.values[`${nodeId}:${pin.id}`]
  const live =
    pin.kind === 'time' && fallbackLive !== undefined
      ? fallbackLive
      : side === 'in' && pin.id === PORT.signalIn2 && mirroredFark !== undefined
        ? mirroredFark
        : incoming != null
          ? pin.kind === 'time'
            ? livePinValueAtHandle(runtime.values, incoming.nodeId, incoming.handle)
            : livePinValue(runtime.values, incoming.nodeId, incoming.handle)
          : fallbackLive !== undefined
            ? fallbackLive
            : livePinValue(runtime.values, nodeId, pin.id)
  const value = formatPinValue(live, pin.kind)
  const wire = pinFromHandle(nodeId, pin.id)
  const pending = wire ? wiring.isPending(nodeId, pin.id) : false
  const target = wire ? wiring.isCompatible(wire) : false
  const focused = xref.focusKey === `${nodeId}:${pin.id}`

  return (
    <div
      className={`cfc-pin-cell is-${side}${incoming ? ' has-from' : ''}${pending ? ' is-pending' : ''}${target ? ' is-target' : ''}${focused ? ' is-xref-focus' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        if (wiring.pending && wire) wiring.pick(wire)
        else xref.trace(nodeId, pin.id)
      }}
    >
      <div className="cfc-pin-meta">
        <button
          type="button"
          className="cfc-pin-name nodrag nopan"
          onClick={(event) => {
            event.stopPropagation()
            if (wiring.pending && wire) wiring.pick(wire)
            else xref.trace(nodeId, pin.id)
          }}
        >
          {pin.label}
        </button>
        {showFrom && incoming ? (
          <span className="cfc-pin-from" title={`${incoming.fbType} · ${incoming.label} · ${incoming.pinLabel}`}>
            {incoming.fbType} · {incoming.label}
          </span>
        ) : null}
      </div>
      <span className={`cfc-pin-live${side === 'out' && pin.kind === 'bool' && value === '1' ? ' is-hot' : ''}`}>{value}</span>
    </div>
  )
}

function HopCard({
  nodeId,
  pin,
  route,
  side,
}: {
  nodeId: string
  pin: IoPin
  route: XrefLink
  side: 'in' | 'out'
}) {
  const xref = useXref()
  const runtime = useRuntime()
  const value = formatValue(
    side === 'in'
      ? livePinValue(runtime.values, route.nodeId, route.handle)
      : livePinValue(runtime.values, nodeId, pin.id),
  )
  const remote = route.samePage ? '' : `${route.pageName} · `

  return (
    <div className={`cfc-hop is-${side} kind-${pin.kind} nopan`}>
      <button
        type="button"
        className="cfc-hop-main nodrag nopan"
        title={`${route.label} · ${route.fbType} · ${route.pinLabel}`}
        onClick={(event) => {
          event.stopPropagation()
          xref.trace(nodeId, pin.id)
          xref.jump(route)
        }}
      >
        <span className="cfc-hop-head">
          <em>{route.fbType}</em>
          <strong>{route.label}</strong>
        </span>
        <span className="cfc-hop-path">
          {side === 'out'
            ? `${pin.label} → ${remote}${route.pinLabel}`
            : `${remote}${route.pinLabel} → ${pin.label}`}
        </span>
        <b>{value}</b>
      </button>
      <button
        type="button"
        className="cfc-hop-drop nodrag nopan"
        title="Bağlantıyı kaldır"
        onClick={(event) => {
          event.stopPropagation()
          xref.disconnect(nodeId, pin.id, side, route)
        }}
      >
        ×
      </button>
    </div>
  )
}

function CfcBlock({
  id,
  tool,
  selected,
  watched,
  instance,
  fbType,
  header,
  value,
  unit,
  caption,
  status,
  pins,
  pinFallbackLive,
}: {
  id: string
  tool: ToolId
  selected: boolean
  watched?: boolean
  instance: string
  fbType: string
  header: string
  value: string
  unit?: string
  caption?: string
  status: 'run' | 'wait'
  pins: IoPin[]
  pinFallbackLive?: Record<string, number>
}) {
  const wiring = useWiring()
  const rows = Math.max(1, ...pins.map((pin) => pin.row + 1))
  const height = cfcBlockHeight(rows)

  return (
    <article
      className={`cfc-block ${selected ? 'is-selected' : ''} ${watched ? 'is-watched' : ''} ${wiring.pending ? 'is-wiring' : ''} status-${status}`}
      data-tool={tool}
      style={{ width: CFC.width, height }}
    >
      <header className="cfc-head" style={{ height: CFC.headerH, background: header }}>
        <div className="cfc-head-main">
          <span className="cfc-fb">{fbType}</span>
          <span className="cfc-inst" title={instance}>
            {instance}
          </span>
        </div>
        <span className="cfc-flags">
          {watched ? <span className="cfc-led mon">MON</span> : null}
          <span className={`cfc-led ${status}`}>{status === 'run' ? 'RUN' : 'WAIT'}</span>
        </span>
      </header>
      <div className="cfc-value" style={{ height: CFC.valueH }}>
        <strong>
          {value}
          {unit ? <em>{unit}</em> : null}
        </strong>
        {caption ? <span className="cfc-caption">{caption}</span> : null}
      </div>
      <div className="cfc-io" style={{ height: rows * CFC.rowH }}>
        {Array.from({ length: rows }, (_, row) => {
          const inPin = pins.find((pin) => pin.side === 'in' && pin.row === row)
          return (
            <div key={row} className="cfc-row" style={{ height: CFC.rowH }}>
              <PinCell
                nodeId={id}
                pin={inPin}
                side="in"
                showFrom={false}
                fallbackLive={inPin ? pinFallbackLive?.[inPin.id] : undefined}
              />
              <PinCell nodeId={id} pin={pins.find((pin) => pin.side === 'out' && pin.row === row)} side="out" />
            </div>
          )
        })}
      </div>
      {pins.map((pin) => {
        const wire = pinFromHandle(id, pin.id)
        const pending = wire ? wiring.isPending(id, pin.id) : false
        const target = wire ? wiring.isCompatible(wire) : false
        return (
          <Handle
            key={`${pin.side}-${pin.id}`}
            type={pin.side === 'in' ? 'target' : 'source'}
            position={pin.side === 'in' ? Position.Left : Position.Right}
            id={pin.id}
            className={`cfc-pin handle-${pin.kind}${pending ? ' is-pending' : ''}${target ? ' is-target' : ''}`}
            style={{ top: cfcPinTop(pin.row) }}
            onClick={(event) => {
              event.stopPropagation()
              if (wire) wiring.pick(wire)
            }}
          />
        )
      })}
    </article>
  )
}

function useLockPins(id: string, version?: number) {
  const update = useUpdateNodeInternals()
  useEffect(() => {
    update(id)
  }, [id, update, version])
}

function maDurationParam(
  values: Record<string, number | null>,
  nodes: AppNode[],
  edges: ReturnType<ReturnType<typeof useReactFlow>['getEdges']>,
  maId: string,
  pinId: string,
  fallback: number,
  route?: { nodeId: string; handle: string },
): number {
  if (route) {
    const src = nodes.find((item) => item.id === route.nodeId)
    const fromRoute = readNumericSource(values, route.nodeId, route.handle, src)
    if (fromRoute != null) return fromRoute
  }
  return resolveWiredNumeric(values, nodes, edges, maId, pinId, fallback)
}

function GenericNode({ id, data, selected, type }: NodeProps<AppNode>) {
  useLockPins(id, data.inputCount)
  const { getEdges, getNodes } = useReactFlow()
  const xref = useXref()
  const { isWatched } = useWatch()
  const runtime = useRuntime()
  const edges = getEdges()
  const allNodes = getNodes() as AppNode[]
  const def = blockById(type ?? 'signal')
  const value = runtime.values[id]
  const q = runtime.values[`${id}:${PORT.boolOut}`]
  const pins = pinsForNode({ type, data })
  const signalKind = SIGNAL_OPTIONS.find((item) => item.id === data.signalKind)?.label
  const pinFallback =
    type === 'limit'
      ? { [PORT.signalIn2]: data.limitMin, [PORT.signalIn3]: data.limitMax }
      : type === 'norm'
        ? {
            [PORT.signalIn2]: resolveWiredNumeric(runtime.values, allNodes, edges, id, PORT.signalIn2, data.normAlt),
            [PORT.signalIn3]: resolveWiredNumeric(runtime.values, allNodes, edges, id, PORT.signalIn3, data.normUst),
          }
        : type === 'limitler'
          ? {
              [PORT.signalIn]: data.limitMin,
              [PORT.signalIn2]: data.limitMax,
              [PORT.signalIn3]: data.normAlt,
              [PORT.signalIn4]: data.normUst,
            }
      : type === 'spikeFilt' || type === 'oluBant'
        ? {
            [PORT.signalIn3]: resolveWiredNumeric(
              runtime.values,
              allNodes,
              edges,
              id,
              edges.some((edge) => edge.target === id && edge.targetHandle === PORT.signalIn3)
                ? PORT.signalIn3
                : PORT.signalIn2,
              data.amplitude,
            ),
          }
        : type === 'ma'
          ? {
              [PORT.timeIn]: maDurationParam(
                runtime.values,
                allNodes,
                edges,
                id,
                PORT.timeIn,
                data.windowSec,
                xref.routes(id, PORT.timeIn, 'in')[0],
              ),
              [PORT.timeIn2]: maDurationParam(
                runtime.values,
                allNodes,
                edges,
                id,
                PORT.timeIn2,
                data.delaySec ?? 0,
                xref.routes(id, PORT.timeIn2, 'in')[0],
              ),
            }
          : undefined

  return (
    <CfcBlock
      id={id}
      tool={def.id}
      selected={selected}
      watched={isWatched(id)}
      instance={data.label}
      fbType={def.fbType}
      header={def.header}
      value={
        type === 'time'
          ? q
            ? 'Q=1'
            : `${(value ?? data.windowSec).toFixed(1)} / ${data.windowSec.toFixed(0)}`
          : type === 'const'
            ? formatValue(value ?? data.amplitude)
            : formatValue(value)
      }
      unit={type === 'time' || type === 'ton' || type === 'tof' ? 's' : undefined}
      caption={
        type === 'tamSayi'
          ? TAM_SAYI_MODES.find((item) => item.id === (data.tamSayiMode ?? 'round'))?.label
          : type === 'norm'
          ? '−5 … +5'
          : type === 'winMinMax'
            ? `N=${clampSampleWindow(data.preset)}`
            : type === 'signal'
              ? signalKind
              : undefined
      }
      pinFallbackLive={pinFallback}
      status={
        type === 'limit' ||
        type === 'norm' ||
        type === 'limitler' ||
        type === 'tamSayi' ||
        type === 'degisim' ||
        type === 'oluBant' ||
        type === 'spikeFilt' ||
        type === 'winMinMax' ||
        type === 'signal' ||
        type === 'time' ||
        type === 'digital' ||
        type === 'const' ||
        value != null
          ? 'run'
          : 'wait'
      }
      pins={pins}
    />
  )
}

function SheetLane({ data, selected }: NodeProps<AppNode>) {
  const incoming = data.label === 'Gelen'
  return (
    <div className={`sheet-lane ${incoming ? 'is-in' : 'is-out'} ${selected ? 'is-selected' : ''}`}>
      <span className="sheet-lane-title">{incoming ? 'Gelen sinyal' : 'Giden sinyal'}</span>
    </div>
  )
}

function SheetRow({ id, data, selected, type }: NodeProps<AppNode>) {
  useLockPins(id)
  const xref = useXref()
  const incoming = type === 'sheetIn'
  const pins = pinsForNode({ type, data })
  const focused = pins.some((pin) => xref.focusKey === `${id}:${pin.id}`)

  return (
    <article
      className={`sheet-io ${incoming ? 'is-in' : 'is-out'} ${selected ? 'is-selected' : ''} ${focused ? 'is-xref-focus' : ''}`}
      style={{ width: SHEET.width, height: SHEET.height }}
      title={`${incoming ? 'Gelen' : 'Giden'} · sayfa ${data.busName} · ${data.label}`}
    >
      <header className="sheet-io-head">
        <span className="sheet-row-tag">
          {incoming ? (
            <>
              <em>I</em>
              {data.busName}
            </>
          ) : (
            <>
              {data.busName}
              <em>O</em>
            </>
          )}
        </span>
        <span className="sheet-row-name">{data.label}</span>
      </header>
      <div className="sheet-io-ports">
        <PinCell nodeId={id} pin={pins.find((pin) => pin.side === 'in')} side="in" />
        <PinCell nodeId={id} pin={pins.find((pin) => pin.side === 'out')} side="out" />
      </div>
      {pins.map((pin) => (
        <Handle
          key={pin.id}
          type={pin.side === 'in' ? 'target' : 'source'}
          position={pin.side === 'in' ? Position.Left : Position.Right}
          id={pin.id}
          className={`cfc-pin handle-${pin.kind}${xref.focusKey === `${id}:${pin.id}` ? ' is-xref-focus' : ''}`}
          style={{ top: SHEET.pinTop }}
          isConnectable={false}
        />
      ))}
    </article>
  )
}

function NoteNode({ id, data, selected }: NodeProps<AppNode>) {
  const { setNodes } = useReactFlow()
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = (noteText: string) => {
    setNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, data: { ...node.data, noteText } } : node)),
    )
  }

  return (
    <article className={`note-block ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`}>
      <NodeResizer isVisible={Boolean(selected)} minWidth={140} minHeight={56} color="#c9a227" />
      <span className="note-mark">Aa</span>
      {editing ? (
        <textarea
          ref={inputRef}
          className="note-input nodrag nowheel"
          value={data.noteText}
          style={{ fontSize: data.fontSize }}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => setEditing(false)}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
            }
          }}
        />
      ) : (
        <p className="note-text" style={{ fontSize: data.fontSize }} onDoubleClick={() => setEditing(true)}>
          {data.noteText || 'Açıklama yazın'}
        </p>
      )}
    </article>
  )
}

function HopPanel({ id, data, selected }: NodeProps<AppNode>) {
  const xref = useXref()
  const { getNodes } = useReactFlow()
  const side = data.remoteHandle === 'in' ? 'in' : 'out'
  const source = getNodes().find((node) => node.id === data.remoteNodeId)
  const pins = source ? pinsForNode(source as AppNode) : []
  const sections = pins
    .filter((pin) => pin.side === side)
    .sort((a, b) => a.row - b.row)
    .map((pin) => ({ pin, routes: xref.routes(data.remoteNodeId, pin.id, side) }))
    .filter((section) => section.routes.length > 0)
  const hopSections = sections.map((item) => ({
    pinId: item.pin.id,
    pinLabel: item.pin.label,
    pinKind: item.pin.kind,
    row: item.pin.row,
    routes: item.routes,
  }))
  useLockPins(id, hopSections.map((item) => item.pinId).join())
  if (!source || sections.length === 0) return null
  return (
    <article className={`hop-panel is-${side} ${selected ? 'is-selected' : ''}`}>
      {sections.map((section) => (
        <Handle
          key={`handle-${section.pin.id}`}
          type={side === 'out' ? 'target' : 'source'}
          position={Position.Left}
          id={hopHandleId(section.pin.id)}
          className={`cfc-pin hop-panel-handle handle-${section.pin.kind}`}
          style={{
            top:
              side === 'in'
                ? hopInSectionHandleTop(hopSections, section.pin.id)
                : hopSectionTop(hopSections, section.pin.id),
          }}
        />
      ))}
      {sections.map((section) => (
        <section key={section.pin.id} className={`hop-panel-section kind-${section.pin.kind}`}>
          <header>{section.pin.label}</header>
          {section.routes.map((route) => (
            <HopCard
              key={`${route.nodeId}:${route.handle}`}
              nodeId={data.remoteNodeId}
              pin={section.pin}
              route={route}
              side={side}
            />
          ))}
        </section>
      ))}
    </article>
  )
}

export const nodeTypes = Object.fromEntries(
  BLOCKS.map((block) => [
    block.id,
    block.id === 'note'
      ? NoteNode
      : block.id === 'sheetLane'
        ? SheetLane
        : block.id === 'sheetIn' || block.id === 'sheetOut'
          ? SheetRow
          : block.id === 'hopPanel'
            ? HopPanel
            : GenericNode,
  ]),
) as Record<ToolId, typeof GenericNode>
