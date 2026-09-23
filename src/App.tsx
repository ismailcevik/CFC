import {
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Background,
  Controls,
  type Connection,
  type IsValidConnection,
  type NodeMouseHandler,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Inspector } from './components/Inspector'
import { LiveChart } from './components/LiveChart'
import { Toolbox } from './components/Toolbox'
import { blockById, interlockPins } from './blocks'
import { defaultNodeData } from './catalog'
import { stepSimulation } from './engine'
import { CfcConnectionLine, EdgeHoverProvider, edgeTypes } from './edges'
import { nodeTypes } from './nodes'
import { samePortKind } from './ports'
import { RuntimeContext, WatchContext } from './runtime'
import { emptyPage, loadWorkbench, mergeActivePage, nextPageName, pruneEmptyPages, saveWorkbench } from './storage'
import type { AppEdge, AppNode, NodeRuntime, RuntimeSnapshot, Sample, ToolId, WorkPage } from './types'
import {
  WiringContext,
  canWire,
  defaultOutputPin,
  firstCompatiblePin,
  toConnection,
  type WirePin,
} from './wiring'
import { SAMPLE_DT } from './types'
import '@xyflow/react/dist/style.css'

const SIGNAL_COLORS = ['#4ea1ff', '#38bdf8', '#818cf8', '#22d3ee', '#a78bfa', '#fb7185']
const saved = loadWorkbench()

function createNode(
  tool: ToolId,
  position: { x: number; y: number },
  existing: AppNode[],
  pageId: string,
): AppNode {
  const count = existing.filter((node) => node.type === tool).length + 1
  const color = SIGNAL_COLORS[(count - 1) % SIGNAL_COLORS.length]
  return {
    id: `${pageId}-${tool}-${crypto.randomUUID().slice(0, 8)}`,
    type: tool,
    position,
    connectable: tool !== 'note',
    style: tool === 'note' ? { width: 220, height: 96 } : undefined,
    data: defaultNodeData(tool, {
      label: tool === 'note' ? `Not_${count}` : `${blockById(tool).fbType}_${count}`,
      ...(tool === 'signal' ? { color } : {}),
      ...(tool === 'note' ? { noteText: 'Açıklama yazın' } : {}),
    }),
  }
}

function Workbench() {
  const { screenToFlowPosition, fitView } = useReactFlow()
  const [pages, setPages] = useState<WorkPage[]>(saved.pages)
  const [activePageId, setActivePageId] = useState(saved.activePageId)
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0]
  const [nodes, setNodes, onNodesChange] = useNodesState(activePage.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(activePage.edges)
  const [query, setQuery] = useState('')
  const [showTools, setShowTools] = useState(false)
  const [showChart, setShowChart] = useState(false)
  const [watched, setWatched] = useState<string[]>(saved.watched)
  const [clock, setClock] = useState(0)
  const [values, setValues] = useState<Record<string, number | null>>({})
  const [series, setSeries] = useState<Record<string, Sample[]>>({})
  const seriesRef = useRef<Record<string, Sample[]>>({})
  const stateRef = useRef<Record<string, NodeRuntime>>({})
  const timeRef = useRef(0)
  const graphRef = useRef({ nodes, edges, pages, activePageId })
  const clipboardRef = useRef<{ nodes: AppNode[]; edges: AppEdge[] } | null>(null)
  const [pendingWire, setPendingWire] = useState<WirePin | null>(null)
  const [inspectedId, setInspectedId] = useState<string | null>(null)

  graphRef.current = { nodes, edges, pages, activePageId }

  const selectedNodes = nodes.filter((node) => node.selected)
  const inspected = nodes.find((node) => node.id === inspectedId) ?? null
  const allNodes = useMemo(
    () => mergeActivePage(pages, activePageId, nodes, edges).flatMap((page) => page.nodes),
    [pages, activePageId, nodes, edges],
  )

  const runtime = useMemo<RuntimeSnapshot>(
    () => ({ t: clock, running: true, values, series }),
    [clock, values, series],
  )
  const watchApi = useMemo(
    () => ({
      watched,
      isWatched: (id: string) => watched.includes(id),
    }),
    [watched],
  )

  useEffect(() => {
    const snapshot = {
      version: 1 as const,
      activePageId,
      pages: pruneEmptyPages(mergeActivePage(pages, activePageId, nodes, edges), activePageId),
      watched,
    }
    saveWorkbench(snapshot)
  }, [pages, activePageId, nodes, edges, watched])

  useEffect(() => {
    const timer = window.setInterval(() => {
      timeRef.current += SAMPLE_DT
      const latest = graphRef.current
      const merged = mergeActivePage(latest.pages, latest.activePageId, latest.nodes, latest.edges)
      let nextSeries = seriesRef.current
      const nextValues: Record<string, number | null> = {}
      for (const page of merged) {
        const stepped = stepSimulation(
          page.nodes,
          page.edges,
          nextSeries,
          timeRef.current,
          stateRef.current,
        )
        nextSeries = stepped.series
        Object.assign(nextValues, stepped.values)
      }
      seriesRef.current = nextSeries
      setClock(timeRef.current)
      setValues(nextValues)
      setSeries(nextSeries)
    }, SAMPLE_DT * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const toggleWatch = useCallback((id: string) => {
    setWatched((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      return [...current, id]
    })
  }, [])

  const toggleChart = useCallback(() => {
    setShowChart((open) => {
      if (open) return false
      setWatched((current) => {
        if (current.length > 0) return current
        return selectedNodes.filter((node) => node.type !== 'note').map((node) => node.id)
      })
      return true
    })
  }, [selectedNodes])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        const cleaned = current.filter(
          (edge) =>
            !(edge.target === connection.target && edge.targetHandle === connection.targetHandle),
        )
        return addEdge(
          {
            ...connection,
            type: 'cfc',
            animated: false,
            id: `e-${connection.source}-${connection.target}-${connection.targetHandle}`,
          },
          cleaned,
        )
      })
      setPendingWire(null)
    },
    [setEdges],
  )

  const pickWire = useCallback(
    (pin: WirePin) => {
      if (!pendingWire) {
        setPendingWire(pin)
        return
      }
      if (pendingWire.nodeId === pin.nodeId && pendingWire.handle === pin.handle) {
        setPendingWire(null)
        return
      }
      if (canWire(pendingWire, pin)) {
        onConnect(toConnection(pendingWire, pin))
        return
      }
      setPendingWire(pin)
    },
    [onConnect, pendingWire],
  )

  const wiringApi = useMemo(
    () => ({
      pending: pendingWire,
      pick: pickWire,
      cancel: () => setPendingWire(null),
      isPending: (nodeId: string, handle: string) =>
        pendingWire?.nodeId === nodeId && pendingWire.handle === handle,
      isCompatible: (pin: WirePin) => Boolean(pendingWire && canWire(pendingWire, pin)),
    }),
    [pendingWire, pickWire],
  )

  const onNodeClick = useCallback<NodeMouseHandler<AppNode>>(
    (event, node) => {
      if (node.type === 'note') return
      if (event.detail > 1) return
      if (event.shiftKey || event.ctrlKey || event.metaKey) return
      if (pendingWire) {
        const match = firstCompatiblePin(node, pendingWire)
        if (match) pickWire(match)
        else setPendingWire(null)
        return
      }
      const output = defaultOutputPin(node)
      if (output) setPendingWire(output)
      if (showChart) toggleWatch(node.id)
    },
    [pendingWire, pickWire, showChart, toggleWatch],
  )

  const onNodeDoubleClick = useCallback<NodeMouseHandler<AppNode>>((_event, node) => {
    setPendingWire(null)
    setInspectedId(node.id)
  }, [])

  const isValidConnection = useCallback<IsValidConnection<AppEdge>>((connection) => {
    if (connection.source === connection.target) return false
    return samePortKind(connection.sourceHandle, connection.targetHandle)
  }, [])

  const addTool = useCallback(
    (tool: ToolId, position?: { x: number; y: number }) => {
      const nextPosition = position ?? {
        x: 120 + nodes.length * 24,
        y: 90 + nodes.length * 18,
      }
      setNodes((current) => [...current, createNode(tool, nextPosition, current, activePageId)])
      if (tool === 'note') return
      window.requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 220 })
      })
    },
    [activePageId, fitView, nodes.length, setNodes],
  )

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const tool = event.dataTransfer.getData('application/signal-tool') as ToolId
      if (!tool) return
      addTool(tool, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    },
    [addTool, screenToFlowPosition],
  )

  const updateNode = useCallback(
    (id: string, patch: Partial<AppNode['data']>) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      )
      if (patch.inputCount != null) {
        const allowed = new Set(interlockPins(patch.inputCount).map((pin) => pin.id))
        setEdges((current) =>
          current.filter(
            (edge) =>
              edge.target !== id ||
              !edge.targetHandle?.startsWith('in-bool') ||
              allowed.has(edge.targetHandle),
          ),
        )
      }
    },
    [setEdges, setNodes],
  )

  const switchPage = useCallback(
    (pageId: string) => {
      if (pageId === activePageId) return
      const merged = mergeActivePage(graphRef.current.pages, activePageId, nodes, edges)
      const pruned = pruneEmptyPages(merged, pageId)
      const next = pruned.find((page) => page.id === pageId)
      setPages(pruned)
      setActivePageId(pageId)
      setNodes(next?.nodes ?? [])
      setEdges(next?.edges ?? [])
      setInspectedId(null)
      window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 180 }))
    },
    [activePageId, edges, fitView, nodes, setEdges, setNodes],
  )

  const addPage = useCallback(() => {
    const merged = pruneEmptyPages(
      mergeActivePage(graphRef.current.pages, activePageId, nodes, edges),
      activePageId,
    )
    const next = emptyPage(nextPageName(merged))
    setPages([...merged, next])
    setActivePageId(next.id)
    setNodes([])
    setEdges([])
    setInspectedId(null)
  }, [activePageId, edges, nodes, setEdges, setNodes])

  const clearPage = useCallback(() => {
    setNodes([])
    setEdges([])
    setInspectedId(null)
    setWatched((current) => current.filter((id) => !nodes.some((node) => node.id === id)))
  }, [nodes, setEdges, setNodes])

  const updatePageTitle = useCallback(
    (title: string) => {
      setPages((current) =>
        current.map((page) => (page.id === activePageId ? { ...page, title } : page)),
      )
    },
    [activePageId],
  )

  const copySelection = useCallback(() => {
    const picked = nodes.filter((node) => node.selected)
    if (picked.length === 0) return
    const ids = new Set(picked.map((node) => node.id))
    clipboardRef.current = {
      nodes: picked,
      edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    }
  }, [edges, nodes])

  const pasteSelection = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip?.nodes.length) return
    const idMap = new Map(
      clip.nodes.map((node) => [
        node.id,
        `${activePageId}-${node.type ?? 'signal'}-${crypto.randomUUID().slice(0, 8)}`,
      ]),
    )
    const copies = clip.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) ?? node.id,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: true,
    }))
    const copiesEdges = clip.edges.map((edge) => ({
      ...edge,
      id: `e-${idMap.get(edge.source)}-${idMap.get(edge.target)}-${edge.targetHandle}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
    }))
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...copies])
    setEdges((current) => [...current, ...copiesEdges])
  }, [activePageId, setEdges, setNodes])

  const alignSelected = useCallback(
    (axis: 'x' | 'y') => {
      const picked = nodes.filter((node) => node.selected)
      if (picked.length < 2) return
      const origin = Math.min(...picked.map((node) => node.position[axis]))
      setNodes((current) =>
        current.map((node) =>
          node.selected ? { ...node, position: { ...node.position, [axis]: origin } } : node,
        ),
      )
    },
    [nodes, setNodes],
  )

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      setNodes((current) =>
        current.map((node) =>
          node.selected
            ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
            : node,
        ),
      )
    },
    [setNodes],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return
      if (event.key === 'Escape') {
        if (pendingWire) setPendingWire(null)
        else setInspectedId(null)
        return
      }
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && key === 'c') {
        event.preventDefault()
        copySelection()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'v') {
        event.preventDefault()
        pasteSelection()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'd') {
        event.preventDefault()
        copySelection()
        pasteSelection()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault()
        setNodes((current) => current.map((node) => ({ ...node, selected: true })))
        return
      }
      const step = event.shiftKey ? 32 : 8
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        nudgeSelected(-step, 0)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        nudgeSelected(step, 0)
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        nudgeSelected(0, -step)
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        nudgeSelected(0, step)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copySelection, nudgeSelected, pasteSelection, pendingWire, setNodes])

  return (
    <RuntimeContext.Provider value={runtime}>
      <WatchContext.Provider value={watchApi}>
        <WiringContext.Provider value={wiringApi}>
        <div className={`app-shell ${showChart ? 'chart-open' : ''}`}>
          <header className="topbar">
            <nav className="page-tabs" aria-label="Sayfalar">
              {pages
                .filter((page) => page.id === activePageId || page.nodes.length > 0)
                .map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    className={page.id === activePageId ? 'page-tab active' : 'page-tab'}
                    onClick={() => switchPage(page.id)}
                    title={page.title || `Sayfa ${page.name}`}
                  >
                    <span className="page-tab-num">{page.name}</span>
                    {page.title ? <span className="page-tab-label">{page.title}</span> : null}
                  </button>
                ))}
              <button type="button" className="page-tab add" onClick={addPage}>
                +
              </button>
            </nav>
            <div className="topbar-actions">
              <button
                type="button"
                className={showTools ? 'primary' : 'ghost'}
                onClick={() => setShowTools((value) => !value)}
              >
                Araçlar
              </button>
              <button
                type="button"
                className={showChart ? 'primary' : 'ghost'}
                onClick={toggleChart}
              >
                Canlı izleme
              </button>
              <button type="button" className="ghost" onClick={clearPage}>
                Sayfayı temizle
              </button>
            </div>
          </header>

          <div
            className={`workspace ${showTools ? 'tools-open' : ''} ${inspected ? 'inspector-open' : ''}`}
          >
            {showTools ? (
              <Toolbox
                query={query}
                onQuery={setQuery}
                onPick={(tool) => addTool(tool)}
                onHide={() => setShowTools(false)}
              />
            ) : null}

            <main className="canvas-wrap">
              <label className="page-heading">
                <span className="page-heading-num">{activePage.name}</span>
                <input
                  className="page-heading-input"
                  value={activePage?.title ?? ''}
                  placeholder="Sayfa başlığı — örn. Sistem fan norm ve gradyan hesabı"
                  onChange={(event) => updatePageTitle(event.target.value)}
                />
              </label>
              {pendingWire ? (
                <p className="wire-hint">
                  Bağlantı: {pendingWire.kind} {pendingWire.side === 'out' ? 'çıkış' : 'giriş'} seçildi ·
                  eşleşen pine veya bloğa tıkla · Esc iptal
                </p>
              ) : null}
              {selectedNodes.length > 1 ? (
                <div className="selection-bar">
                  <span>{selectedNodes.length} blok</span>
                  <button type="button" className="ghost compact" onClick={() => alignSelected('x')}>
                    Hizala sol
                  </button>
                  <button type="button" className="ghost compact" onClick={() => alignSelected('y')}>
                    Hizala üst
                  </button>
                  <button type="button" className="ghost compact" onClick={copySelection}>
                    Kopyala
                  </button>
                  <button type="button" className="ghost compact" onClick={pasteSelection}>
                    Yapıştır
                  </button>
                </div>
              ) : null}
              <EdgeHoverProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onNodeDoubleClick={onNodeDoubleClick}
                onPaneClick={() => setPendingWire(null)}
                isValidConnection={isValidConnection}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: 'cfc', style: { stroke: '#5a6d80', strokeWidth: 1.6 } }}
                connectionLineComponent={CfcConnectionLine}
                elevateEdgesOnSelect
                selectionOnDrag
                selectionMode={SelectionMode.Partial}
                panOnDrag={[1, 2]}
                panActivationKeyCode="Space"
                multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
                selectNodesOnDrag={false}
                zoomOnDoubleClick={false}
                fitView
                deleteKeyCode={['Backspace', 'Delete']}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={20} color="#c5ced6" />
                <Controls />
              </ReactFlow>
              </EdgeHoverProvider>
            </main>

            {inspected ? (
              <Inspector
                node={inspected}
                nodes={nodes}
                edges={edges}
                onChange={updateNode}
                onHide={() => setInspectedId(null)}
              />
            ) : null}
          </div>

          {showChart ? (
            <LiveChart
              nodes={allNodes}
              watched={watched}
              onUnwatch={(id) => setWatched((current) => current.filter((item) => item !== id))}
              onHide={() => setShowChart(false)}
            />
          ) : null}
        </div>
        </WiringContext.Provider>
      </WatchContext.Provider>
    </RuntimeContext.Provider>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Workbench />
    </ReactFlowProvider>
  )
}
