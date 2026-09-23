import { Handle, NodeResizer, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { BLOCKS, blockById, interlockPins, type IoPin } from './blocks'
import { SIGNAL_OPTIONS } from './catalog'
import { CFC, cfcPinTop } from './cfc'
import { formatValue } from './engine'
import { useRuntime, useWatch } from './runtime'
import type { AppNode, ToolId } from './types'
import { pinFromHandle, useWiring } from './wiring'

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
  status,
  pins,
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
  status: 'run' | 'wait'
  pins: IoPin[]
}) {
  const wiring = useWiring()
  const rows = Math.max(1, ...pins.map((pin) => pin.row + 1))
  const height = CFC.headerH + CFC.valueH + rows * CFC.rowH

  return (
    <article
      className={`cfc-block ${selected ? 'is-selected' : ''} ${watched ? 'is-watched' : ''} ${wiring.pending ? 'is-wiring' : ''} status-${status}`}
      data-tool={tool}
      style={{ width: CFC.width, height }}
    >
      <header className="cfc-head" style={{ height: CFC.headerH, background: header }}>
        <span className="cfc-fb">{fbType}</span>
        <span className="cfc-inst" title={instance}>
          {instance}
        </span>
      </header>
      <div className="cfc-value" style={{ height: CFC.valueH }}>
        <strong>
          {value}
          {unit ? <em>{unit}</em> : null}
        </strong>
        <span className="cfc-flags">
          {watched ? <span className="cfc-led mon">MON</span> : null}
          <span className={`cfc-led ${status}`}>{status === 'run' ? 'RUN' : 'WAIT'}</span>
        </span>
      </div>
      <div className="cfc-io" style={{ height: rows * CFC.rowH }}>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="cfc-row" style={{ height: CFC.rowH }}>
            <span>{pins.find((pin) => pin.side === 'in' && pin.row === row)?.label ?? ''}</span>
            <span className="cfc-out-name">
              {pins.find((pin) => pin.side === 'out' && pin.row === row)?.label ?? ''}
            </span>
          </div>
        ))}
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

function GenericNode({ id, data, selected, type }: NodeProps<AppNode>) {
  useLockPins(id, data.inputCount)
  const { isWatched } = useWatch()
  const runtime = useRuntime()
  const def = blockById(type ?? 'signal')
  const value = runtime.values[id]
  const pins =
    type === 'interlock'
      ? interlockPins(data.inputCount)
      : type === 'signal'
        ? [{ ...def.pins[0], label: SIGNAL_OPTIONS.find((item) => item.id === data.signalKind)?.label ?? 'OUT' }]
        : def.pins

  return (
    <CfcBlock
      id={id}
      tool={def.id}
      selected={selected}
      watched={isWatched(id)}
      instance={data.label}
      fbType={def.fbType}
      header={def.header}
      value={type === 'time' ? (value ?? data.windowSec).toFixed(1) : formatValue(value)}
      unit={type === 'time' ? 's' : undefined}
      status={
        type === 'signal' || type === 'time' || type === 'digital' || value != null
          ? 'run'
          : 'wait'
      }
      pins={pins}
    />
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

export const nodeTypes = Object.fromEntries(
  BLOCKS.map((block) => [block.id, block.id === 'note' ? NoteNode : GenericNode]),
) as Record<ToolId, typeof GenericNode>
