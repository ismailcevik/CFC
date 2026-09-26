import { BLOCKS } from './blocks'
import { defaultNodeData } from './catalog'
import { createSistemFanPages } from './sistemfan'
import type { AppEdge, AppNode, WorkPage } from './types'

const KNOWN_TOOLS = new Set<string>(BLOCKS.map((block) => block.id))

export const STORAGE_KEY = 'cfc-workbench-v1'

export type StoredWorkbench = {
  version: 1
  activePageId: string
  pages: WorkPage[]
  watched: string[]
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
  const pages = createSistemFanDefault()
  return {
    version: 1,
    activePageId: pages[0].id,
    pages,
    watched: [],
  }
}

function createSistemFanDefault(): WorkPage[] {
  return createSistemFanPages()
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

function sanitizePage(page: WorkPage, knownNodeIds?: Set<string>): WorkPage {
  const nodes = page.nodes
    .filter((node) => node.type != null && KNOWN_TOOLS.has(node.type))
    .map((node) => ({
      ...node,
      selected: false,
      data: defaultNodeData(node.type ?? 'signal', node.data ?? {}),
    }))
  const ids = new Set(nodes.map((node) => node.id))
  const known = knownNodeIds ?? ids
  return {
    ...page,
    title: typeof page.title === 'string' ? page.title : '',
    family: typeof page.family === 'string' ? page.family : undefined,
    section: typeof page.section === 'string' ? page.section : undefined,
    nodes,
    edges: page.edges
      .filter((edge) => ids.has(edge.source) && known.has(edge.target))
      .map((edge) => ({ ...edge, type: 'cfc' })),
  }
}

function sanitizePages(pages: WorkPage[]): WorkPage[] {
  const nodesOnly = pages.map((page) => sanitizePage(page))
  const known = new Set(nodesOnly.flatMap((page) => page.nodes.map((node) => node.id)))
  return pages.map((page) => sanitizePage(page, known))
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
    const pages = pruneEmptyPages(sanitizePages(parsed.pages), activePageId)
    const activeId = pages.some((page) => page.id === activePageId) ? activePageId : pages[0].id
    const nodeIds = new Set(pages.flatMap((page) => page.nodes.map((node) => node.id)))
    return {
      version: 1,
      activePageId: activeId,
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
      pages: pruneEmptyPages(sanitizePages(state.pages), state.activePageId),
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
