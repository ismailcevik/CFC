import { useMemo, useState } from 'react'
import { BLOCKS, CATEGORIES } from '../blocks'
import type { ToolDef } from '../catalog'
import type { ToolId } from '../types'

type ToolboxProps = {
  query: string
  onQuery: (value: string) => void
  onPick: (id: ToolId) => void
  onHide: () => void
}

export function Toolbox({ query, onQuery, onPick, onHide }: ToolboxProps) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((item) => [item.id, true])),
  )

  const grouped = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return CATEGORIES.map((category) => ({
      ...category,
      tools: BLOCKS.filter((block) => {
        if (block.category !== category.id) return false
        if (!q) return true
        return `${block.label} ${block.hint} ${block.ports} ${block.fbType}`.toLocaleLowerCase('tr').includes(q)
      }),
    })).filter((category) => category.tools.length > 0)
  }, [query])

  return (
    <aside className="panel toolbox">
      <div className="panel-head">
        <div className="panel-head-row">
          <h2>Araçlar</h2>
          <button type="button" className="ghost compact" onClick={onHide}>
            Gizle
          </button>
        </div>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Araç ara"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      {grouped.map((category) => (
        <section key={category.id} className="tool-cat">
          <button
            type="button"
            className="tool-cat-head"
            onClick={() => setOpen((current) => ({ ...current, [category.id]: !current[category.id] }))}
          >
            <span>{category.label}</span>
            <span>{open[category.id] === false ? '+' : '−'}</span>
          </button>
          {open[category.id] === false ? null : (
            <ul className="tool-list">
              {category.tools.map((tool) => (
                <ToolItem
                  key={tool.id}
                  tool={{
                    id: tool.id,
                    label: tool.label,
                    hint: tool.hint,
                    ports: tool.ports,
                    accent: tool.color,
                  }}
                  onPick={onPick}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </aside>
  )
}

function ToolItem({ tool, onPick }: { tool: ToolDef; onPick: (id: ToolId) => void }) {
  return (
    <li>
      <button
        type="button"
        className="tool-card"
        draggable
        onClick={() => onPick(tool.id)}
        onDragStart={(event) => {
          event.dataTransfer.setData('application/signal-tool', tool.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
      >
        <span className="tool-accent" style={{ background: tool.accent }} />
        <span className="tool-copy">
          <strong>{tool.label}</strong>
          <em>{tool.hint}</em>
          <small>{tool.ports}</small>
        </span>
      </button>
    </li>
  )
}
