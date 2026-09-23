import { BLOCKS } from './blocks'
import { SIGNAL_PRESETS, defaultNodeData } from './catalog'
import type { AppEdge, AppNode, WorkPage } from './types'

const KNOWN_TOOLS = new Set<string>(BLOCKS.map((block) => block.id))

export const STORAGE_KEY = 'cfc-workbench-v1'

export type StoredWorkbench = {
  version: 1
  activePageId: string
  pages: WorkPage[]
  watched: string[]
}

function starterNodes(pageId: string): AppNode[] {
  return [
    ...SIGNAL_PRESETS.map((preset) => ({
      id: `${pageId}-${preset.id}`,
      type: 'signal' as const,
      position: preset.position,
      data: defaultNodeData('signal', {
        label: preset.label,
        signalKind: preset.signalKind,
        frequency: preset.frequency,
        amplitude: preset.amplitude,
        color: preset.color,
      }),
    })),
    {
      id: `${pageId}-time-5`,
      type: 'time' as const,
      position: { x: 280, y: 16 },
      data: defaultNodeData('time', { label: 'Zaman · 5 s', windowSec: 5 }),
    },
    {
      id: `${pageId}-time-10`,
      type: 'time' as const,
      position: { x: 280, y: 128 },
      data: defaultNodeData('time', { label: 'Zaman · 10 s', windowSec: 10 }),
    },
    {
      id: `${pageId}-ma-1`,
      type: 'ma' as const,
      position: { x: 280, y: 260 },
      data: defaultNodeData('ma', { label: 'MA_1' }),
    },
    {
      id: `${pageId}-out-1`,
      type: 'display' as const,
      position: { x: 520, y: 260 },
      data: defaultNodeData('display', { label: 'OUT_1' }),
    },
  ]
}

export function emptyPage(name: string): WorkPage {
  return {
    id: `p${name}-${crypto.randomUUID().slice(0, 6)}`,
    name,
    title: '',
    nodes: [],
    edges: [],
  }
}

export function defaultWorkbench(): StoredWorkbench {
  const first = emptyPage('1')
  first.nodes = starterNodes(first.id)
  return {
    version: 1,
    activePageId: first.id,
    pages: [first],
    watched: [],
  }
}

export function nextPageName(pages: WorkPage[]): string {
  const nums = pages.map((page) => Number(page.name)).filter((value) => Number.isFinite(value))
  return String((nums.length ? Math.max(...nums) : 0) + 1)
}

export function pruneEmptyPages(pages: WorkPage[], activePageId: string): WorkPage[] {
  const kept = pages.filter((page) => page.id === activePageId || page.nodes.length > 0)
  if (kept.length > 0) return kept
  const fallback = pages[0] ?? emptyPage('1')
  return [fallback]
}

function sanitizePage(page: WorkPage): WorkPage {
  const nodes = page.nodes
    .filter((node) => node.type != null && KNOWN_TOOLS.has(node.type))
    .map((node) => ({
      ...node,
      selected: false,
      data: defaultNodeData(node.type ?? 'signal', node.data ?? {}),
    }))
  const ids = new Set(nodes.map((node) => node.id))
  return {
    ...page,
    title: typeof page.title === 'string' ? page.title : '',
    nodes,
    edges: page.edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({ ...edge, type: 'cfc' })),
  }
}

export function loadWorkbench(): StoredWorkbench {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultWorkbench()
    const parsed = JSON.parse(raw) as StoredWorkbench
    if (parsed.version !== 1 || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      return defaultWorkbench()
    }
    const activePageId = parsed.pages.some((page) => page.id === parsed.activePageId)
      ? parsed.activePageId
      : parsed.pages[0].id
    const pages = pruneEmptyPages(parsed.pages.map(sanitizePage), activePageId)
    const nodeIds = new Set(pages.flatMap((page) => page.nodes.map((node) => node.id)))
    return {
      version: 1,
      activePageId: pages.some((page) => page.id === activePageId) ? activePageId : pages[0].id,
      pages,
      watched: (parsed.watched ?? []).filter((id) => nodeIds.has(id)),
    }
  } catch {
    return defaultWorkbench()
  }
}

export function saveWorkbench(state: StoredWorkbench) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      pages: pruneEmptyPages(state.pages.map(sanitizePage), state.activePageId),
    }),
  )
}

export function mergeActivePage(
  pages: WorkPage[],
  activePageId: string,
  nodes: AppNode[],
  edges: AppEdge[],
): WorkPage[] {
  return pages.map((page) =>
    page.id === activePageId ? { ...page, nodes, edges } : page,
  )
}
