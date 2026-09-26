import { useState } from 'react'
import {
  INTERLOCK_MAX,
  SAMPLE_WINDOW_MAX,
  boolRoutePins,
  clampInputCount,
  clampSampleWindow,
  interlockPins,
} from '../blocks'
import { boolOutPort } from '../ports'
import { SIGNAL_OPTIONS, TAM_SAYI_MODES } from '../catalog'
import { formatValue, livePinValue, maWindowInfo } from '../engine'
import { PORT } from '../ports'
import { useRuntime } from '../runtime'
import type { AppEdge, AppNode, DigitalMode, SignalKind, TamSayiMode } from '../types'

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

        {node.type === 'const' ? (
          <>
            <Num
              label="Sabit değer"
              value={node.data.amplitude}
              step={0.001}
              onChange={(value) => set({ amplitude: value })}
            />
            <p className="hint">Bu sayı simülasyonda sürekli OUT pininden gönderilir (zamanlayıcı değildir).</p>
          </>
        ) : null}

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
            <Num label="Orta" value={node.data.offset} step={1} onChange={(value) => set({ offset: value })} />
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

        {node.type === 'time' || node.type === 'ton' || node.type === 'tof' ? (
          <Num label="Süre (s)" value={node.data.windowSec} step={0.5} min={0.1} onChange={(value) => set({ windowSec: value })} />
        ) : null}

        {node.type === 'time' ? (
          <p className="hint">
            IN=1 ve bağlıyken geri sayım yapılır; IN=0 veya IN bağlı değilken saymaz (kaldığı yerden devam). Sıfırlanınca Q 1 saniye 1
            kalır. OUT süre değeridir.
          </p>
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

        {node.type === 'norm' ? (
          <>
            <Num label="Alt hedef" value={node.data.normAlt} step={0.1} onChange={(value) => set({ normAlt: value })} />
            <Num label="Üst hedef" value={node.data.normUst} step={0.1} onChange={(value) => set({ normUst: value })} />
            <Stat label="OUT" value={formatValue(runtime.values[node.id])} />
            <p className="hint">
              Değer alt hedefte OUT = −5, üst hedefte OUT = +5 (arada doğrusal, 10 birimlik norm bandı). Sonuç −5 ile +5 arasında
              sınırlanır. Hedef pinlerine Limitler bloğu da bağlanabilir.
            </p>
          </>
        ) : null}

        {node.type === 'limitler' ? (
          <>
            <Num label="Alt limit" value={node.data.limitMin} step={0.1} onChange={(value) => set({ limitMin: value })} />
            <Num label="Üst limit" value={node.data.limitMax} step={0.1} onChange={(value) => set({ limitMax: value })} />
            <Num label="Alt hedef" value={node.data.normAlt} step={0.1} onChange={(value) => set({ normAlt: value })} />
            <Num label="Üst hedef" value={node.data.normUst} step={0.1} onChange={(value) => set({ normUst: value })} />
            <Stat label="Alt limit OUT" value={formatValue(runtime.values[`${node.id}:${PORT.signalOut}`])} />
            <Stat label="Üst limit OUT" value={formatValue(runtime.values[`${node.id}:${PORT.signalOut2}`])} />
            <Stat label="Alt hedef OUT" value={formatValue(runtime.values[`${node.id}:${PORT.signalOut3}`])} />
            <Stat label="Üst hedef OUT" value={formatValue(runtime.values[`${node.id}:${PORT.signalOut4}`])} />
            <p className="hint">
              Dört değer aynı isimli çıkış pinlerinden dağıtılır (Norm, LIMIT vb.). Giriş pinine kablo gelirse o anlık değer
              geçer.
            </p>
          </>
        ) : null}

        {node.type === 'limit' ? (
          <>
            <Stat
              label="IN (ham)"
              value={formatValue(
                livePinValue(
                  runtime.values,
                  edges.find((edge) => edge.target === node.id && edge.targetHandle === PORT.signalIn)?.source,
                  edges.find((edge) => edge.target === node.id && edge.targetHandle === PORT.signalIn)?.sourceHandle,
                ),
              )}
            />
            <p className="hint">
              MN ve MX ayrı giriş pinlerinde görünür (Inspector veya Sabit K ile de ayarlanabilir). IN ham sinyal; OUT sınırlı
              çıkıştır.
            </p>
          </>
        ) : null}

        {node.type === 'ctu' ? (
          <Num label="PV / preset" value={node.data.preset} step={1} min={1} onChange={(value) => set({ preset: value })} />
        ) : null}

        {node.type === 'tamSayi' ? (
          <>
            <label>
              Dönüşüm
              <select
                value={node.data.tamSayiMode ?? 'round'}
                onChange={(event) => set({ tamSayiMode: event.target.value as TamSayiMode })}
              >
                {TAM_SAYI_MODES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Stat label="OUT (tam)" value={formatValue(runtime.values[node.id])} />
            <p className="hint">
              Örnek: 3,7 → en yakın 4 · ondalığı at 3 · aşağı 3 · yukarı 4. Negatifte de aynı kurallar geçerlidir.
            </p>
          </>
        ) : null}

        {node.type === 'degisim' ? (
          <>
            <Stat label="Fark (≥0)" value={formatValue(runtime.values[node.id])} />
            <p className="hint">
              OUT = |IN − önceki IN|; işaret yok (ör. −2 değil, 2). İlk örnekte 0. Çıkışı SPIKE / Ölü bant Fark
              pinine bağlayın; SUB ile işaretli fark kullanmayın.
            </p>
          </>
        ) : null}

        {node.type === 'oluBant' ? (
          <>
            <Num
              label="X (ölü bant)"
              value={node.data.amplitude}
              step={0.1}
              min={0}
              onChange={(value) => set({ amplitude: Math.max(0, value) })}
            />
            <Stat label="OUT" value={formatValue(runtime.values[node.id])} />
            <p className="hint">
              <strong>Değişim</strong> → Fark pinine. Fark&lt;X iken OUT sabit; Fark≥X iken OUT=IN. Fark her zaman ≥0.
              Bağlı değilse |IN−OUT| kullanılır.
            </p>
          </>
        ) : null}

        {node.type === 'spikeFilt' ? (
          <>
            <Num
              label="X (max fark)"
              value={node.data.amplitude}
              step={0.1}
              min={0}
              onChange={(value) => set({ amplitude: Math.max(0, value) })}
            />
            <Stat
              label="IN (ham)"
              value={formatValue(
                livePinValue(
                  runtime.values,
                  edges.find((edge) => edge.target === node.id && edge.targetHandle === PORT.signalIn)?.source,
                  edges.find((edge) => edge.target === node.id && edge.targetHandle === PORT.signalIn)?.sourceHandle,
                ),
              )}
            />
            <Stat
              label="Fark (pin)"
              value={formatValue(
                livePinValue(
                  runtime.values,
                  edges.find((edge) => edge.target === node.id && edge.targetHandle === PORT.signalIn2)?.source,
                  edges.find((edge) => edge.target === node.id && edge.targetHandle === PORT.signalIn2)?.sourceHandle,
                ),
              )}
            />
            <Stat label="OUT (filtreli)" value={formatValue(runtime.values[node.id])} />
            <p className="hint">
              IN = korunan sinyal. <strong>Değişim</strong> → Fark pinine. Fark&gt;X ise sıçrama, OUT önceki kalır;
              Fark≤X ise OUT=IN. Fark signed değil (SUB −2 yerine Değişim 2 verir).
            </p>
          </>
        ) : null}

        {node.type === 'winMinMax' ? (
          <>
            <Num
              label="Örnek adedi (N)"
              value={clampSampleWindow(node.data.preset)}
              step={1}
              min={2}
              max={SAMPLE_WINDOW_MAX}
              onChange={(value) => set({ preset: clampSampleWindow(value) })}
            />
            <Stat label="MAX" value={formatValue(runtime.values[`${node.id}:${PORT.signalOut}`])} />
            <Stat label="MIN" value={formatValue(runtime.values[`${node.id}:${PORT.signalOut2}`])} />
            <p className="hint">
              Son N simülasyon adımındaki en büyük değer MAX pininde, en küçük değer MIN pininde. Örn. -3…2 dizisinde MAX=2,
              MIN=-3.
            </p>
          </>
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

        {node.type === 'and' || node.type === 'or' || node.type === 'xor' ? (
          <LogicGateDetails node={node} edges={edges} onChange={set} />
        ) : null}

        {node.type === 'boolRoute' ? (
          <BoolRouteDetails node={node} edges={edges} onChange={set} />
        ) : null}

        {node.type === 'sheetIn' || node.type === 'sheetOut' ? (
          <>
            <Stat label="Yön" value={node.type === 'sheetIn' ? 'Gelen sinyal' : 'Giden sinyal'} />
            <Stat label="Karşı sayfa" value={node.data.busName || '—'} />
            <p className="hint">Listeye tıklayınca karşı sayfadaki bloğa geçilir.</p>
          </>
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
        ) : node.type === 'sheetIn' ||
          node.type === 'sheetOut' ||
          node.type === 'sheetLane' ||
          node.type === 'hopPanel' ||
          node.type === 'boolRoute' ||
          node.type === 'limit' ||
          node.type === 'norm' ||
          node.type === 'tamSayi' ||
          node.type === 'degisim' ||
          node.type === 'oluBant' ||
          node.type === 'limitler' ||
          node.type === 'winMinMax' ? null : (
          <Stat label="Çıkış" value={formatValue(runtime.values[node.id])} />
        )}

        {node.type === 'limit' ? (
          <Stat label="OUT (sınırlı)" value={formatValue(runtime.values[node.id])} />
        ) : null}
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
  const info = maWindowInfo(nodes, edges, runtime.series, runtime.t, node.id, runtime.values)
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
      <Stat label="OUT aralık" value={`T−${info.windowSec.toFixed(0)} … T−0`} />
      {info.delaySec > 0 ? (
        <Stat label="ÖNCE aralık" value={`T−${older.toFixed(0)} … T−${info.delaySec.toFixed(0)}`} />
      ) : null}
      <Stat label="Örnek (OUT)" value={String(info.count)} />
    </>
  )
}

function wired(edges: AppEdge[], nodeId: string, handle: string) {
  return edges.some((edge) => edge.target === nodeId && edge.targetHandle === handle)
}

function LogicGateDetails({
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
  const gate =
    node.type === 'and' ? 'AND (hepsi 1)' : node.type === 'or' ? 'OR (en az biri 1)' : 'XOR (tek sayıda 1)'
  return (
    <>
      <Num
        label="Giriş sayısı"
        value={count}
        step={1}
        min={1}
        max={INTERLOCK_MAX}
        onChange={(value) => onChange({ inputCount: clampInputCount(value) })}
      />
      <Stat label="Mantık" value={gate} />
      <Stat label="Bağlı giriş" value={`${used} / ${count}`} />
      <Stat label="Q" value={q == null ? '—' : q ? '1' : '0'} />
    </>
  )
}

function BoolRouteDetails({
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
  const pins = boolRoutePins(count)
  const ins = pins.filter((pin) => pin.side === 'in')
  const wiredIn = ins.filter((pin) => wired(edges, node.id, pin.id)).length
  return (
    <>
      <Num
        label="Kanal sayısı"
        value={count}
        step={1}
        min={1}
        max={INTERLOCK_MAX}
        onChange={(value) => onChange({ inputCount: clampInputCount(value) })}
      />
      <Stat label="Bağlı giriş" value={`${wiredIn} / ${count}`} />
      {Array.from({ length: count }, (_, index) => {
        const out = boolOutPort(index)
        const v = runtime.values[`${node.id}:${out}`]
        return <Stat key={out} label={`OUT${index + 1}`} value={formatValue(v)} />
      })}
    </>
  )
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
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? formatNumField(value)

  const commit = (raw: string) => {
    if (raw === '' || raw === '-' || raw === '+') return
    const next = Number.parseFloat(raw)
    if (!Number.isFinite(next)) return
    if (min != null && next < min) onChange(min)
    else if (max != null && next > max) onChange(max)
    else onChange(next)
  }

  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onFocus={() => setDraft(formatNumField(value))}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          commit(raw)
        }}
        onBlur={() => {
          if (draft != null) commit(draft)
          setDraft(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function formatNumField(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value))
  return String(value)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
