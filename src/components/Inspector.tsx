import { INTERLOCK_MAX, clampInputCount, interlockPins } from '../blocks'
import { SIGNAL_OPTIONS } from '../catalog'
import { formatValue, maWindowInfo } from '../engine'
import { PORT } from '../ports'
import { useRuntime } from '../runtime'
import type { AppEdge, AppNode, DigitalMode, SignalKind } from '../types'

type InspectorProps = {
  node: AppNode
  nodes: AppNode[]
  edges: AppEdge[]
  onChange: (id: string, patch: Partial<AppNode['data']>) => void
  onHide: () => void
}

export function Inspector({ node, nodes, edges, onChange, onHide }: InspectorProps) {
  const runtime = useRuntime()
  const set = (patch: Partial<AppNode['data']>) => onChange(node.id, patch)

  return (
    <aside className="panel inspector">
      <div className="panel-head-row">
        <div className="panel-head">
          <h2>{node.data.label}</h2>
        </div>
        <button type="button" className="ghost compact" onClick={onHide}>
          Gizle
        </button>
      </div>
      <div className="field-stack">
        <label>
          Ad
          <input type="text" value={node.data.label} onChange={(event) => set({ label: event.target.value })} />
        </label>

        {node.type === 'signal' ? (
          <>
            <label>
              Sinyal
              <select
                value={node.data.signalKind}
                onChange={(event) => set({ signalKind: event.target.value as SignalKind })}
              >
                {SIGNAL_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Num label="Genlik" value={node.data.amplitude} step={0.1} onChange={(value) => set({ amplitude: value })} />
            <Num label="Frekans (Hz)" value={node.data.frequency} step={0.05} min={0.05} onChange={(value) => set({ frequency: value })} />
          </>
        ) : null}

        {node.type === 'digital' ? (
          <>
            <label>
              Mod
              <select
                value={node.data.digitalMode}
                onChange={(event) => set({ digitalMode: event.target.value as DigitalMode })}
              >
                <option value="off">0 / OFF</option>
                <option value="on">1 / ON</option>
                <option value="pulse">Pulse</option>
              </select>
            </label>
            {node.data.digitalMode === 'pulse' ? (
              <Num label="Frekans (Hz)" value={node.data.frequency} step={0.1} min={0.05} onChange={(value) => set({ frequency: value })} />
            ) : null}
          </>
        ) : null}

        {node.type === 'time' || node.type === 'ton' || node.type === 'tof' || node.type === 'pt1' ? (
          <Num label="Süre (s)" value={node.data.windowSec} step={0.5} min={0.1} onChange={(value) => set({ windowSec: value })} />
        ) : null}

        {node.type === 'hys' ? (
          <>
            <Num label="Alt eşik" value={node.data.hysLow} step={0.1} onChange={(value) => set({ hysLow: value })} />
            <Num label="Üst eşik" value={node.data.hysHigh} step={0.1} onChange={(value) => set({ hysHigh: value })} />
          </>
        ) : null}

        {node.type === 'limit' || node.type === 'pid' ? (
          <>
            <Num label="MN" value={node.data.limitMin} step={0.1} onChange={(value) => set({ limitMin: value })} />
            <Num label="MX" value={node.data.limitMax} step={0.1} onChange={(value) => set({ limitMax: value })} />
          </>
        ) : null}

        {node.type === 'ctu' ? (
          <Num label="PV / preset" value={node.data.preset} step={1} min={1} onChange={(value) => set({ preset: value })} />
        ) : null}

        {node.type === 'pid' ? (
          <>
            <Num label="Kp" value={node.data.kp} step={0.1} onChange={(value) => set({ kp: value })} />
            <Num label="Ti (s)" value={node.data.ti} step={0.1} min={0} onChange={(value) => set({ ti: value })} />
            <Num label="Td (s)" value={node.data.td} step={0.1} min={0} onChange={(value) => set({ td: value })} />
          </>
        ) : null}

        {node.type === 'ramp' ? (
          <Num label="TM (s)" value={node.data.rampSec} step={0.5} min={0.1} onChange={(value) => set({ rampSec: value })} />
        ) : null}

        {node.type === 'ma' ? (
          <MADetails node={node} nodes={nodes} edges={edges} onChange={set} />
        ) : null}

        {node.type === 'interlock' ? (
          <InterlockDetails node={node} edges={edges} onChange={set} />
        ) : null}

        {node.type === 'note' ? (
          <>
            <label>
              Metin
              <textarea
                className="note-field"
                rows={5}
                value={node.data.noteText}
                onChange={(event) => set({ noteText: event.target.value })}
              />
            </label>
            <Num label="Yazı boyutu" value={node.data.fontSize} step={1} min={10} onChange={(value) => set({ fontSize: value })} />
          </>
        ) : (
          <Stat label="Çıkış" value={formatValue(runtime.values[node.id])} />
        )}
      </div>
    </aside>
  )
}

function MADetails({
  node,
  nodes,
  edges,
  onChange,
}: {
  node: AppNode
  nodes: AppNode[]
  edges: AppEdge[]
  onChange: (patch: Partial<AppNode['data']>) => void
}) {
  const runtime = useRuntime()
  const info = maWindowInfo(nodes, edges, runtime.series, runtime.t, node.id)
  const delayWired = wired(edges, node.id, PORT.timeIn2)
  const older = info.windowSec + info.delaySec
  return (
    <>
      <Stat label="Durum" value={info.ready ? 'Bağlı' : 'Eksik bağlantı'} />
      <Stat label="Pencere" value={`${info.windowSec.toFixed(1)} s`} />
      {delayWired ? (
        <Stat label="Gecikme" value={`${info.delaySec.toFixed(1)} s`} />
      ) : (
        <Num
          label="Gecikme (s)"
          value={node.data.delaySec}
          step={0.5}
          min={0}
          onChange={(value) => onChange({ delaySec: Math.max(0, value) })}
        />
      )}
      <Stat label="Aralık" value={`T−${older.toFixed(0)} … T−${info.delaySec.toFixed(0)}`} />
      <Stat label="Örnek" value={String(info.count)} />
    </>
  )
}

function wired(edges: AppEdge[], nodeId: string, handle: string) {
  return edges.some((edge) => edge.target === nodeId && edge.targetHandle === handle)
}

function InterlockDetails({
  node,
  edges,
  onChange,
}: {
  node: AppNode
  edges: AppEdge[]
  onChange: (patch: Partial<AppNode['data']>) => void
}) {
  const runtime = useRuntime()
  const count = clampInputCount(node.data.inputCount)
  const used = interlockPins(count)
    .filter((pin) => pin.side === 'in' && wired(edges, node.id, pin.id))
    .length
  const q = runtime.values[node.id]
  return (
    <>
      <Num
        label="Koşul sayısı"
        value={count}
        step={1}
        min={1}
        max={INTERLOCK_MAX}
        onChange={(value) => onChange({ inputCount: clampInputCount(value) })}
      />
      <Stat label="Durum" value={q == null ? 'Bekliyor' : q ? 'Serbest' : 'Kilit'} />
      <Stat label="Bağlı" value={`${used} / ${count}`} />
    </>
  )
}

function Num({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  step: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
