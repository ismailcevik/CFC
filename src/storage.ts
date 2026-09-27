import { BLOCKS } from './blocks'
import { defaultNodeData } from './catalog'
import { createSistemFanPages, hasLegacyDemoPages } from './sistemfan'
import type { AppEdge, AppNode, WorkPage } from './types'

const KNOWN_TOOLS = new Set<string>(BLOCKS.map((block) => block.id))

export const WORKBENCH_DB_ROUTE = '/api/db/workbench'

const LEGACY_STORAGE_PREFIX = 'cfc-workbench-'

/** Eski sürümlerde kalan tarayıcı önbelleğini temizler; artık yazılmaz. */
export function purgeBrowserWorkbenchCache() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(LEGACY_STORAGE_PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    /* private mode / disabled storage */
  }
}

/** Boş tek sayfa — db sıfırdan çizim için. */
export function blankWorkbench(): StoredWorkbench {
  const page: WorkPage = {
    id: 'page-1',
    name: '1',
    title: '',
    nodes: [],
    edges: [],
  }
  return {
    version: 1,
    activePageId: page.id,
    pages: [page],
    watched: [],
  }
}

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

function normalizeStoredWorkbench(parsed: StoredWorkbench): StoredWorkbench {
  if (parsed.version !== 1 || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    return blankWorkbench()
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
}

export function parseImportedWorkbench(raw: string): StoredWorkbench {
  const parsed = JSON.parse(raw) as StoredWorkbench
  if (parsed.version !== 1 || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error('Geçersiz veya boş proje dosyası')
  }
  return normalizeStoredWorkbench(parsed)
}

export function downloadWorkbenchJson(state: StoredWorkbench, filename = 'cfc-workbench.json') {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function prepareWorkbenchSnapshot(state: StoredWorkbench): StoredWorkbench {
  return {
    ...state,
    pages: pruneEmptyPages(sanitizePages(state.pages), state.activePageId),
  }
}

export async function loadWorkbenchFromDb(): Promise<StoredWorkbench | null> {
  try {
    const response = await fetch(WORKBENCH_DB_ROUTE, { cache: 'no-store' })
    if (response.status === 404) return null
    if (!response.ok) return null
    const parsed = (await response.json()) as StoredWorkbench | null
    if (!parsed) return null
    return normalizeStoredWorkbench(parsed)
  } catch {
    return null
  }
}

export async function saveWorkbenchToDb(state: StoredWorkbench): Promise<boolean> {
  const prepared = prepareWorkbenchSnapshot(state)
  try {
    const response = await fetch(WORKBENCH_DB_ROUTE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prepared, null, 2),
    })
    return response.ok
  } catch {
    return false
  }
}

async function resolveAuthoritativeWorkbench(): Promise<StoredWorkbench> {
  const fromDb = await loadWorkbenchFromDb()
  if (fromDb) {
    if (hasLegacyDemoPages(fromDb.pages)) {
      const blank = blankWorkbench()
      await saveWorkbenchToDb(blank)
      return blank
    }
    return fromDb
  }
  const blank = blankWorkbench()
  await saveWorkbenchToDb(blank)
  return blank
}

export async function bootWorkbenchFromDb(): Promise<StoredWorkbench> {
  purgeBrowserWorkbenchCache()
  return resolveAuthoritativeWorkbench()
}

/** db/workbench.json dosyasını boş projeyle değiştir. */
export async function clearDbWorkbench(): Promise<StoredWorkbench> {
  const blank = blankWorkbench()
  await saveWorkbenchToDb(blank)
  return blank
}

/** db/workbench.json (API) kaynağını yeniden oku (diske yazmaz). */
export async function forceReloadWorkbenchFromDb(): Promise<StoredWorkbench> {
  purgeBrowserWorkbenchCache()
  const fromDb = await loadWorkbenchFromDb()
  if (fromDb) return fromDb
  return blankWorkbench()
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
