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
import { blockById, nodeUsesInputCount, pinsForNode } from './blocks'
import { defaultNodeData } from './catalog'
import { stepSimulation } from './engine'
import { edgeTypes } from './edges'
import { nodeTypes } from './nodes'
import { samePortKind } from './ports'
import { RuntimeContext, WatchContext } from './runtime'
import {
  bootWorkbenchFromDb,
  downloadWorkbenchJson,
  emptyPage,
  mergeActivePage,
  nextPageName,
  parseImportedWorkbench,
  pruneEmptyPages,
  saveWorkbench,
  saveWorkbenchToDb,
  type StoredWorkbench,
} from './storage'
import {
  clampSheetPosition,
  disconnectVisualEdges,
  isSheetChrome,
  isSheetNode,
  membersOfLane,
  sheetJumpTarget,
  sheetSignature,
  syncSheetLists,
} from './sheets'
import {
  constrainNodeChanges,
  findClearGroupOffset,
  findClearPosition,
  nodeSize,
  placementOk,
} from './placement'
import {
  disconnectRoute,
  filterHopPanelSelection,
  hopPanelRemovesForDeletedBlocks,
  hopSignature,
  isHopEdge,
  isHopPanel,
  syncHopPanels,
} from './hops'
import { sortPages } from './sistemfan'
import {
  XrefContext,
  collectRoutes,
  collectXrefs,
  pageOfNode,
  type XrefLink,
  xrefKey,
} from './xref'
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

function prepareInitialWorkbench(loaded: StoredWorkbench): StoredWorkbench {
  const pages = syncHopPanels(syncSheetLists(loaded.pages))
  return { ...loaded, pages }
}

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
      ...(tool === 'and' || tool === 'or' || tool === 'xor' ? { inputCount: 2 } : {}),
      ...(tool === 'winMinMax' ? { preset: 10 } : {}),
      ...(tool === 'spikeFilt' || tool === 'oluBant' ? { amplitude: 1 } : {}),
      ...(tool === 'signal' ? { color } : {}),
      ...(tool === 'note' ? { noteText: 'Açıklama yazın' } : {}),
    }),
  }
}

type WorkbenchProps = { initial: StoredWorkbench }

function Workbench({ initial }: WorkbenchProps) {
  const booted = useMemo(() => prepareInitialWorkbench(initial), [initial])
  const { screenToFlowPosition, fitView, setViewport } = useReactFlow()
  const [pages, setPages] = useState<WorkPage[]>(booted.pages)
  const [activePageId, setActivePageId] = useState(booted.activePageId)
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0]
  const initialActive = useMemo(
    () => booted.pages.find((page) => page.id === booted.activePageId) ?? booted.pages[0],
    [booted.activePageId, booted.pages],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(initialActive.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialActive.edges)
  const [query, setQuery] = useState('')
  const [showTools, setShowTools] = useState(false)
  const [showChart, setShowChart] = useState(false)
  const [watched, setWatched] = useState<string[]>(booted.watched)
  const [clock, setClock] = useState(0)
  const [values, setValues] = useState<Record<string, number | null>>({})
  const [series, setSeries] = useState<Record<string, Sample[]>>({})
  const seriesRef = useRef<Record<string, Sample[]>>({})
  const stateRef = useRef<Record<string, NodeRuntime>>({})
  const timeRef = useRef(0)
  const graphRef = useRef({ nodes, edges, pages, activePageId, watched })
  const saveTimerRef = useRef<number | null>(null)
  const clipboardRef = useRef<{ nodes: AppNode[]; edges: AppEdge[] } | null>(null)
  const [pendingWire, setPendingWire] = useState<WirePin | null>(null)
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const [focusPin, setFocusPin] = useState<string | null>(null)
  const [saveHint, setSaveHint] = useState<string | null>(null)

  graphRef.current = { nodes, edges, pages, activePageId, watched }

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedBlocks = selectedNodes.filter((node) => !isHopPanel(node))
  const stackedNodes = useMemo(
    () =>
      nodes.map((node) => {
        if (node.type === 'sheetLane') return { ...node, zIndex: 1 }
        if (node.type === 'sheetIn' || node.type === 'sheetOut') return { ...node, zIndex: 3 }
        if (node.type === 'note') return { ...node, zIndex: 4 }
        if (isHopPanel(node)) {
          const base = 8600 - Math.round(node.position.y / 4)
          return { ...node, zIndex: node.selected ? base + 600 : base }
        }
        const lift = node.selected ? 7500 : 5000
        return {
          ...node,
          zIndex: lift - Math.round(node.position.y) - Math.round(node.position.x / 8),
        }
      }),
    [nodes],
  )
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

  const workbenchSnapshot = useCallback((): StoredWorkbench => {
    return {
      version: 1,
      activePageId,
      pages: pruneEmptyPages(mergeActivePage(pages, activePageId, nodes, edges), activePageId),
      watched,
    }
  }, [activePageId, edges, nodes, pages, watched])

  const persistWorkbench = useCallback((snapshot: StoredWorkbench) => {
    const prepared = saveWorkbench(snapshot)
    void saveWorkbenchToDb(prepared)
    return prepared
  }, [])

  const saveProject = useCallback(async () => {
    const prepared = persistWorkbench(workbenchSnapshot())
    const ok = await saveWorkbenchToDb(prepared)
    setSaveHint(ok ? 'db kaydedildi' : 'Kaydedildi (db yazılamadı)')
    window.setTimeout(() => setSaveHint(null), 2200)
  }, [persistWorkbench, workbenchSnapshot])

  useEffect(() => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      persistWorkbench(workbenchSnapshot())
      saveTimerRef.current = null
    }, 450)
    return () => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    }
  }, [persistWorkbench, workbenchSnapshot])

  useEffect(() => {
    const flush = () => {
      const latest = graphRef.current
      persistWorkbench({
        version: 1,
        activePageId: latest.activePageId,
        pages: pruneEmptyPages(
          mergeActivePage(latest.pages, latest.activePageId, latest.nodes, latest.edges),
          latest.activePageId,
        ),
        watched: latest.watched,
      })
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [persistWorkbench])

  useEffect(() => {
    const timer = window.setInterval(() => {
      timeRef.current += SAMPLE_DT
      const latest = graphRef.current
      const merged = sortPages(mergeActivePage(latest.pages, latest.activePageId, latest.nodes, latest.edges))
      const stepped = stepSimulation(
        merged.flatMap((page) => page.nodes),
        merged.flatMap((page) => page.edges),
        seriesRef.current,
        timeRef.current,
        stateRef.current,
      )
      const nextSeries = stepped.series
      const nextValues = stepped.values
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
        return selectedNodes.filter((node) => node.type !== 'note' && !isSheetChrome(node)).map((node) => node.id)
      })
      return true
    })
  }, [selectedNodes])

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge: AppEdge = {
        ...connection,
        source: connection.source ?? '',
        target: connection.target ?? '',
        type: 'cfc',
        animated: false,
        id: `e-${connection.source}-${connection.target}-${connection.targetHandle}`,
      }
      const merged = mergeActivePage(graphRef.current.pages, activePageId, graphRef.current.nodes, graphRef.current.edges)
      const sourcePage = pageOfNode(merged, edge.source)
      const dropOnTarget = (list: AppEdge[]) =>
        list.filter(
          (item) =>
            isHopEdge(item) || !(item.target === edge.target && item.targetHandle === edge.targetHandle),
        )

      const withEdge = merged.map((page) => {
        const hostId = sourcePage?.id ?? activePageId
        const cleared = dropOnTarget(page.edges)
        if (page.id !== hostId) return { ...page, edges: cleared }
        return { ...page, edges: addEdge(edge, cleared) }
      })
      const synced = syncHopPanels(syncSheetLists(withEdge))
      const active = synced.find((page) => page.id === activePageId)
      setPages(synced)
      if (active) {
        setNodes(active.nodes)
        setEdges(active.edges)
      }
      setPendingWire(null)
      setFocusPin(xrefKey(edge.source, edge.sourceHandle ?? ''))
    },
    [activePageId, setEdges, setNodes],
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

  const onNodeDoubleClick = useCallback<NodeMouseHandler<AppNode>>((_event, node) => {
    setPendingWire(null)
    setInspectedId(node.id)
  }, [])

  const isValidConnection = useCallback<IsValidConnection<AppEdge>>((connection) => {
    if (connection.source === connection.target) return false
    const source = allNodes.find((node) => node.id === connection.source)
    const target = allNodes.find((node) => node.id === connection.target)
    if (isSheetChrome(source ?? {}) || isSheetChrome(target ?? {}) || isHopPanel(source ?? {}) || isHopPanel(target ?? {})) return false
    return samePortKind(connection.sourceHandle, connection.targetHandle)
  }, [allNodes])

  const addTool = useCallback(
    (tool: ToolId, position?: { x: number; y: number }) => {
      const nextPosition = position ?? {
        x: 120 + nodes.length * 24,
        y: 90 + nodes.length * 18,
      }
      setNodes((current) => {
        const draft = createNode(tool, nextPosition, current, activePageId)
        return [
          ...current,
          { ...draft, position: findClearPosition(draft, draft.position, current, edges) },
        ]
      })
    },
    [activePageId, edges, nodes.length, setNodes],
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
      setNodes((current) => {
        const next = current.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
        )
        if (patch.inputCount != null) {
          const node = next.find((item) => item.id === id)
          if (node?.type && nodeUsesInputCount(node.type)) {
            const allowed = new Set(
              pinsForNode({ type: node.type, data: { ...node.data, inputCount: patch.inputCount } }).map(
                (pin) => pin.id,
              ),
            )
            setEdges((edges) =>
              edges.filter((edge) => {
                if (edge.target === id && edge.targetHandle && !allowed.has(edge.targetHandle)) return false
                if (edge.source === id && edge.sourceHandle && !allowed.has(edge.sourceHandle)) return false
                return true
              }),
            )
          }
        }
        return next
      })
    },
    [setEdges, setNodes],
  )

  const switchPage = useCallback(
    (pageId: string, focus?: XrefLink) => {
      if (pageId === activePageId) return
      const merged = mergeActivePage(graphRef.current.pages, activePageId, nodes, edges)
      const pruned = pruneEmptyPages(merged, pageId)
      const next = pruned.find((page) => page.id === pageId)
      const nextNodes = (next?.nodes ?? []).map((node) => ({
        ...node,
        selected: focus ? node.id === focus.nodeId : false,
      }))
      setPages(pruned)
      setActivePageId(pageId)
      setNodes(nextNodes)
      setEdges(next?.edges ?? [])
      setInspectedId(null)
      if (focus) setFocusPin(xrefKey(focus.nodeId, focus.handle))
      window.requestAnimationFrame(() => {
        if (focus) {
          fitView({ nodes: [{ id: focus.nodeId }], padding: 0.4, duration: 220 })
          return
        }
        setViewport({ x: 0, y: 0, zoom: 1 })
      })
    },
    [activePageId, edges, fitView, nodes, setEdges, setNodes, setViewport],
  )

  const jumpToXref = useCallback(
    (link: XrefLink) => {
      if (link.pageId === activePageId) {
        const key = xrefKey(link.nodeId, link.handle)
        setNodes((current) => current.map((node) => ({ ...node, selected: node.id === link.nodeId })))
        setFocusPin(key)
        window.requestAnimationFrame(() => {
          fitView({ nodes: [{ id: link.nodeId }], padding: 0.4, duration: 220 })
        })
        return
      }
      switchPage(link.pageId, link)
    },
    [activePageId, fitView, setNodes, switchPage],
  )

  const onNodeClick = useCallback<NodeMouseHandler<AppNode>>(
    (event, node) => {
      const multi = event.shiftKey || event.ctrlKey || event.metaKey
      if (!multi) {
        setNodes((current) => current.map((item) => ({ ...item, selected: item.id === node.id })))
      }
      if (node.type === 'note' || node.type === 'sheetLane' || isHopPanel(node)) return
      if (event.detail > 1) return
      if (multi) return
      if (isSheetNode(node)) {
        const live = mergeActivePage(
          graphRef.current.pages,
          graphRef.current.activePageId,
          graphRef.current.nodes,
          graphRef.current.edges,
        )
        const target = sheetJumpTarget(live, node)
        if (target) jumpToXref(target)
        return
      }
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
    [jumpToXref, pendingWire, pickWire, setNodes, showChart, toggleWatch],
  )

  const livePages = useMemo(
    () => mergeActivePage(pages, activePageId, nodes, edges),
    [pages, activePageId, nodes, edges],
  )

  useEffect(() => {
    if (nodes.some((node) => node.dragging)) return
    const sheets = syncSheetLists(livePages)
    const synced = syncHopPanels(sheets)
    if (sheetSignature(livePages) === sheetSignature(sheets) && hopSignature(livePages) === hopSignature(synced)) return
    const active = synced.find((page) => page.id === activePageId)
    setPages(synced)
    if (active) {
      setNodes(active.nodes)
      setEdges(active.edges)
    }
  }, [activePageId, livePages, nodes, setEdges, setNodes])

  const disconnectXref = useCallback(
    (nodeId: string, handle: string, side: 'in' | 'out', link: XrefLink) => {
      const merged = mergeActivePage(
        graphRef.current.pages,
        activePageId,
        graphRef.current.nodes,
        graphRef.current.edges,
      )
      const synced = syncHopPanels(syncSheetLists(disconnectRoute(merged, nodeId, handle, side, link)))
      const active = synced.find((page) => page.id === activePageId)
      setPages(synced)
      if (active) {
        setNodes(active.nodes)
        setEdges(active.edges)
      }
    },
    [activePageId, setEdges, setNodes],
  )

  const xrefApi = useMemo(
    () => ({
      incoming: (nodeId: string, handle: string) => collectXrefs(livePages, nodeId, handle, 'in'),
      outgoing: (nodeId: string, handle: string) => collectXrefs(livePages, nodeId, handle, 'out'),
      routes: (nodeId: string, handle: string, side: 'in' | 'out') => collectRoutes(livePages, nodeId, handle, side),
      jump: jumpToXref,
      trace: (nodeId: string, handle: string) => {
        const key = xrefKey(nodeId, handle)
        setFocusPin((current) => (current === key ? null : key))
      },
      disconnect: disconnectXref,
      focusKey: focusPin,
    }),
    [disconnectXref, focusPin, jumpToXref, livePages],
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

  const deletePage = useCallback(() => {
    const merged = mergeActivePage(graphRef.current.pages, activePageId, nodes, edges)
    const remaining = merged.filter((page) => page.id !== activePageId)
    if (remaining.length === 0) {
      const fresh = emptyPage('1')
      setPages([fresh])
      setActivePageId(fresh.id)
      setNodes([])
      setEdges([])
    } else {
      const nextId = remaining[0].id
      const pruned = pruneEmptyPages(remaining, nextId)
      const targetId = pruned[0]?.id ?? nextId
      const next = pruned.find((page) => page.id === targetId)
      setPages(pruned)
      setActivePageId(targetId)
      setNodes(next?.nodes ?? [])
      setEdges(next?.edges ?? [])
    }
    setInspectedId(null)
    setPendingWire(null)
    setFocusPin(null)
  }, [activePageId, edges, nodes, setEdges, setNodes])

  const clearPage = useCallback(() => {
    const removed = new Set(nodes.filter((node) => !isSheetNode(node)).map((node) => node.id))
    const merged = mergeActivePage(graphRef.current.pages, activePageId, nodes, edges).map((page) =>
      page.id === activePageId
        ? { ...page, nodes: [], edges: [] }
        : {
            ...page,
            edges: page.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
          },
    )
    const synced = syncHopPanels(syncSheetLists(merged))
    const active = synced.find((page) => page.id === activePageId)
    setPages(synced)
    setNodes(active?.nodes ?? [])
    setEdges(active?.edges ?? [])
    setInspectedId(null)
    setWatched((current) => current.filter((id) => !removed.has(id)))
  }, [activePageId, edges, nodes, setEdges, setNodes])

  const updatePageTitle = useCallback(
    (title: string) => {
      setPages((current) =>
        current.map((page) => (page.id === activePageId ? { ...page, title } : page)),
      )
    },
    [activePageId],
  )

  const updatePageName = useCallback(
    (name: string) => {
      const next = name.replace(/[^\d]/g, '')
      if (!next) return
      setPages((current) => {
        const taken = current.find((page) => page.id !== activePageId && page.name === next)
        return current.map((page) => {
          if (page.id === activePageId) return { ...page, name: next }
          if (taken && page.id === taken.id) return { ...page, name: activePage.name }
          return page
        })
      })
    },
    [activePage, activePageId],
  )

  const hopEdges = useMemo(() => edges.filter(isHopEdge), [edges])

  const copySelection = useCallback(() => {
    const picked = nodes.filter((node) => node.selected && !isSheetChrome(node) && !isHopPanel(node))
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
    const shift = findClearGroupOffset(copies, nodes, [...edges, ...copiesEdges])
    const placed = copies.map((node) => ({
      ...node,
      position: { x: node.position.x + shift.x, y: node.position.y + shift.y },
    }))
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...placed])
    setEdges((current) => [...current, ...copiesEdges])
  }, [activePageId, setEdges, setNodes])

  const alignSelected = useCallback(
    (edge: 'left' | 'right' | 'top' | 'bottom') => {
      const picked = nodes.filter((node) => node.selected && !isSheetChrome(node) && !isHopPanel(node))
      if (picked.length < 2) return
      const boxes = picked.map((node) => ({ node, size: nodeSize(node) }))
      const left = Math.min(...boxes.map((item) => item.node.position.x))
      const top = Math.min(...boxes.map((item) => item.node.position.y))
      const right = Math.max(...boxes.map((item) => item.node.position.x + item.size.w))
      const bottom = Math.max(...boxes.map((item) => item.node.position.y + item.size.h))
      const next = nodes.map((node) => {
        if (!node.selected || isSheetChrome(node)) return node
        const size = nodeSize(node)
        if (edge === 'left') return { ...node, position: { ...node.position, x: left } }
        if (edge === 'right') return { ...node, position: { ...node.position, x: right - size.w } }
        if (edge === 'top') return { ...node, position: { ...node.position, y: top } }
        return { ...node, position: { ...node.position, y: bottom - size.h } }
      })
      const moved = new Set(picked.map((node) => node.id))
      if (!placementOk(next, edges, moved)) return
      setNodes(next)
    },
    [edges, nodes, setNodes],
  )

  const distributeVertical = useCallback(() => {
    const picked = nodes.filter((node) => node.selected && !isSheetChrome(node) && !isHopPanel(node))
    if (picked.length < 3) return
    const boxes = picked
      .map((node) => ({ node, size: nodeSize(node) }))
      .sort((a, b) => a.node.position.y - b.node.position.y || a.node.position.x - b.node.position.x)
    const first = boxes[0]
    const last = boxes[boxes.length - 1]
    const span = last.node.position.y + last.size.h - first.node.position.y
    const totalH = boxes.reduce((sum, item) => sum + item.size.h, 0)
    const gap = Math.max(12, (span - totalH) / (boxes.length - 1))
    let y = first.node.position.y
    const placed = new Map<string, number>()
    for (const item of boxes) {
      placed.set(item.node.id, Math.round(y / 4) * 4)
      y += item.size.h + gap
    }
    const next = nodes.map((node) => {
      const nextY = placed.get(node.id)
      return nextY == null ? node : { ...node, position: { ...node.position, y: nextY } }
    })
    const moved = new Set(picked.map((node) => node.id))
    if (!placementOk(next, edges, moved)) return
    setNodes(next)
  }, [edges, nodes, setNodes])

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      const positions = new Map<string, { x: number; y: number }>()
      for (const lane of nodes.filter((node) => node.selected && node.type === 'sheetLane')) {
        positions.set(lane.id, { x: lane.position.x + dx, y: lane.position.y + dy })
        for (const member of membersOfLane(lane, nodes)) {
          positions.set(member.id, { x: member.position.x + dx, y: member.position.y + dy })
        }
      }
      for (const node of nodes) {
        if (!node.selected || positions.has(node.id)) continue
        const desired = { x: node.position.x + dx, y: node.position.y + dy }
        if (isSheetNode(node)) positions.set(node.id, clampSheetPosition(node, nodes, desired, positions))
        else if (node.type !== 'sheetLane') {
          positions.set(node.id, desired)
          if (!isHopPanel(node)) {
            for (const hop of nodes.filter((item) => isHopPanel(item) && item.data.remoteNodeId === node.id)) {
              if (!positions.has(hop.id)) {
                positions.set(hop.id, { x: hop.position.x + dx, y: hop.position.y + dy })
              }
            }
          }
        }
      }
      if (positions.size === 0) return
      const next = nodes.map((node) => {
        const position = positions.get(node.id)
        return position ? { ...node, position } : node
      })
      if (!placementOk(next, edges, new Set(positions.keys()))) return
      setNodes(next)
    },
    [edges, nodes, setNodes],
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
        setNodes((current) => current.map((node) => ({ ...node, selected: !isSheetChrome(node) && !isHopPanel(node) })))
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
        <XrefContext.Provider value={xrefApi}>
        <div className={`app-shell ${showChart ? 'chart-open' : ''}`}>
          <header className="topbar">
            <nav className="page-tabs" aria-label="Sayfalar">
              {sortPages(pages)
                .filter((page) => page.id === activePageId || page.nodes.length > 0)
                .map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    className={page.id === activePageId ? 'page-tab active' : 'page-tab'}
                    onClick={() => switchPage(page.id)}
                    title={page.title ? `${page.name} · ${page.title}` : `Sayfa ${page.name}`}
                  >
                    <span className="page-tab-num">{page.name}</span>
                  </button>
                ))}
              <button type="button" className="page-tab add" onClick={addPage}>
                +
              </button>
              <label className="page-heading">
                <input
                  className="page-heading-num"
                  value={activePage?.name ?? ''}
                  inputMode="numeric"
                  aria-label="Sayfa numarası"
                  onChange={(event) => updatePageName(event.target.value)}
                />
                <input
                  className="page-heading-input"
                  value={activePage?.title ?? ''}
                  placeholder="Bölüm adı"
                  title={activePage?.title?.trim() ? activePage.title : undefined}
                  onChange={(event) => updatePageTitle(event.target.value)}
                />
              </label>
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
              <button type="button" className="primary" onClick={saveProject}>
                {saveHint ?? 'Kaydet'}
              </button>
              <button type="button" className="ghost" onClick={deletePage}>
                Sayfayı sil
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
              {pendingWire ? (
                <p className="wire-hint">
                  Bağlantı: {pendingWire.kind} {pendingWire.side === 'out' ? 'çıkış' : 'giriş'} seçildi ·
                  eşleşen pin karesine tıkla veya sürükle · Esc iptal
                </p>
              ) : null}
              {selectedBlocks.length > 1 ? (
                <div className="selection-bar">
                  <span>{selectedBlocks.length} blok</span>
                  <button type="button" className="ghost compact" onClick={() => alignSelected('left')}>
                    Hizala sol
                  </button>
                  <button type="button" className="ghost compact" onClick={() => alignSelected('right')}>
                    Hizala sağ
                  </button>
                  <button type="button" className="ghost compact" onClick={distributeVertical}>
                    Dikey aralık
                  </button>
                  <button type="button" className="ghost compact" onClick={() => alignSelected('top')}>
                    Hizala üst
                  </button>
                  <button type="button" className="ghost compact" onClick={() => alignSelected('bottom')}>
                    Hizala alt
                  </button>
                  <button type="button" className="ghost compact" onClick={copySelection}>
                    Kopyala
                  </button>
                  <button type="button" className="ghost compact" onClick={pasteSelection}>
                    Yapıştır
                  </button>
                </div>
              ) : null}
              <ReactFlow
                nodes={stackedNodes}
                edges={hopEdges}
                onNodesChange={(changes) => {
                  const base = changes.filter(
                    (change) =>
                      change.type !== 'remove' || !nodes.some((node) => node.id === change.id && isSheetChrome(node)),
                  )
                  const removedBlocks = new Set(
                    base.filter((change) => change.type === 'remove').map((change) => change.id),
                  )
                  const withHopRemoves =
                    removedBlocks.size > 0
                      ? [...base, ...hopPanelRemovesForDeletedBlocks(nodes, removedBlocks)]
                      : base
                  const filtered = filterHopPanelSelection(nodes, withHopRemoves)
                  const next = constrainNodeChanges(nodes, edges, filtered)
                  onNodesChange(next)
                  const removed = next.filter((change) => change.type === 'remove').map((change) => change.id)
                  if (removed.length === 0) return
                  const removedSet = new Set(removed)
                  const mergedNodes = nodes.filter((node) => !removedSet.has(node.id))
                  const mergedEdges = edges.filter(
                    (edge) => !removedSet.has(edge.source) && !removedSet.has(edge.target),
                  )
                  const synced = syncHopPanels(syncSheetLists(mergeActivePage(pages, activePageId, mergedNodes, mergedEdges)))
                  const active = synced.find((page) => page.id === activePageId)
                  if (active) {
                    setPages(synced)
                    setNodes(active.nodes)
                    setEdges(active.edges)
                    return
                  }
                  setPages((current) =>
                    current.map((page) =>
                      page.id === activePageId
                        ? page
                        : {
                            ...page,
                            edges: page.edges.filter(
                              (edge) => !removed.includes(edge.source) && !removed.includes(edge.target),
                            ),
                          },
                    ),
                  )
                }}
                onEdgesChange={(changes) => {
                  const removedIds = changes
                    .filter((change) => change.type === 'remove')
                    .map((change) => change.id)
                  const visuals = edges.filter(
                    (edge) =>
                      removedIds.includes(edge.id) &&
                      nodes.some((node) => isSheetNode(node) && (node.id === edge.source || node.id === edge.target)),
                  )
                  onEdgesChange(changes)
                  if (visuals.length === 0) return
                  setPages((current) => {
                    const merged = mergeActivePage(
                      current,
                      activePageId,
                      nodes,
                      edges.filter((edge) => !removedIds.includes(edge.id)),
                    )
                    return disconnectVisualEdges(merged, visuals)
                  })
                }}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onNodeDoubleClick={onNodeDoubleClick}
                onPaneClick={() => {
                  setPendingWire(null)
                  setFocusPin(null)
                }}
                isValidConnection={isValidConnection}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: 'cfc', className: 'hop-edge' }}
                connectionLineComponent={() => null}
                elevateEdgesOnSelect={false}
                selectionOnDrag
                selectionMode={SelectionMode.Full}
                panOnDrag={[1, 2]}
                panActivationKeyCode="Space"
                multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
                selectNodesOnDrag={false}
                zoomOnDoubleClick={false}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                deleteKeyCode={['Backspace', 'Delete']}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={20} color="#c5ced6" />
                <Controls
                  fitViewOptions={{
                    padding: 0.12,
                    nodes: nodes.map((node) => ({ id: node.id })),
                  }}
                />
              </ReactFlow>
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
        </XrefContext.Provider>
        </WiringContext.Provider>
      </WatchContext.Provider>
    </RuntimeContext.Provider>
  )
}

export default function App() {
  const [initial, setInitial] = useState<StoredWorkbench | null>(null)
  const [bootError, setBootError] = useState(false)

  useEffect(() => {
    let cancelled = false
    bootWorkbenchFromDb()
      .then((workbench) => {
        if (!cancelled) setInitial(prepareInitialWorkbench(workbench))
      })
      .catch(() => {
        if (!cancelled) setBootError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (bootError) {
    return (
      <div className="boot-screen">
        <p>Proje veritabanı okunamadı. Geliştirme sunucusunu yeniden başlatın.</p>
      </div>
    )
  }

  if (!initial) {
    return (
      <div className="boot-screen">
        <p>Çizimler yükleniyor…</p>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <Workbench initial={initial} />
    </ReactFlowProvider>
  )
}
