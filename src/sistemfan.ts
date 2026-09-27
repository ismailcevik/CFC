import { defaultNodeData } from './catalog'
import { syncSheetLists } from './sheets'
import { PORT } from './ports'
import type { AppEdge, AppNode, SignalKind, WorkPage } from './types'

const COLORS = ['#4ea1ff', '#38bdf8', '#818cf8', '#22d3ee', '#a78bfa', '#fb7185', '#34d399', '#fbbf24']

export const SISTEM_FAN_WINDOW_SEC = 60
export const SISTEM_FAN_FAMILY = 'sistemfan'

const SECTIONS = [
  { section: 'sinyal', name: '1', title: 'Sinyaller', id: 'sf-sinyal' },
  { section: 'ma', name: '2', title: 'MA', id: 'sf-ma' },
  { section: 'gradyan', name: '3', title: 'Gradyan', id: 'sf-gradyan' },
  { section: 'norm', name: '4', title: 'Norm', id: 'sf-norm' },
] as const

export const SISTEM_FAN_SIGNALS: {
  tag: string
  label: string
  unit: string
  signalKind: SignalKind
  amplitude: number
  frequency: number
  offset: number
  gradientEnabled: boolean
  gradientInvert: boolean
  normAlt: number
  normBand: number
  gradientStep: number
}[] = [
  { tag: 'ID_FAN_SONRASI_SICAKLIK', label: 'ID Fan Sonrası Sıcaklık', unit: '°C', signalKind: 'sine', amplitude: 10, frequency: 0.03, offset: 190, gradientEnabled: true, gradientInvert: false, normAlt: 130, normBand: 100, gradientStep: 2000 },
  { tag: 'ID_FAN_SONRASI_BASINC', label: 'ID Fan Sonrası Basınç', unit: 'mbar', signalKind: 'sine', amplitude: 0.5, frequency: 0.04, offset: -1, gradientEnabled: true, gradientInvert: true, normAlt: -1.5, normBand: 1, gradientStep: 50 },
  { tag: 'SISTEM_FAN_AMPERI', label: 'Sistem Fan Amperi', unit: 'A', signalKind: 'noisySine', amplitude: 140, frequency: 0.05, offset: 0, gradientEnabled: false, gradientInvert: false, normAlt: 0, normBand: 1, gradientStep: 1 },
  { tag: 'SISTEM_FAN_KW', label: 'Sistem Fan kW', unit: 'kW', signalKind: 'noisySine', amplitude: 220, frequency: 0.05, offset: 0, gradientEnabled: false, gradientInvert: false, normAlt: 0, normBand: 1, gradientStep: 1 },
  { tag: 'SISTEM_FAN_DEVRI', label: 'Sistem Fan Devri', unit: 'rpm', signalKind: 'sine', amplitude: 900, frequency: 0.02, offset: 0, gradientEnabled: false, gradientInvert: false, normAlt: 0, normBand: 1, gradientStep: 1 },
  { tag: 'SISTEM_FAN_DEVRI_SP_FB', label: 'Sistem Fan Devri SP FB', unit: 'rpm', signalKind: 'sine', amplitude: 900, frequency: 0.02, offset: 0, gradientEnabled: false, gradientInvert: false, normAlt: 0, normBand: 1, gradientStep: 1 },
  { tag: 'KD_ANA_TAHRIK_KW', label: 'KD Ana Tahrik kW', unit: 'kW', signalKind: 'noisySine', amplitude: 480, frequency: 0.035, offset: 0, gradientEnabled: false, gradientInvert: false, normAlt: 0, normBand: 1, gradientStep: 1 },
  { tag: 'ID_FAN_SONRASI_KLAPE', label: 'ID Fan Sonrası Klape', unit: '%', signalKind: 'saw', amplitude: 50, frequency: 0.01, offset: 0, gradientEnabled: false, gradientInvert: false, normAlt: 0, normBand: 1, gradientStep: 1 },
]

function wire(source: string, target: string, sourceHandle: string, targetHandle: string): AppEdge {
  return {
    id: `e-${source}-${target}-${targetHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'cfc',
  }
}

function kNode(id: string, x: number, y: number, label: string, value: number): AppNode {
  return {
    id,
    type: 'const',
    position: { x, y },
    data: defaultNodeData('const', { label, amplitude: value }),
  }
}

function sheet(def: (typeof SECTIONS)[number]): WorkPage {
  return {
    id: def.id,
    name: def.name,
    title: def.title,
    family: SISTEM_FAN_FAMILY,
    section: def.section,
    nodes: [],
    edges: [],
  }
}

function addWire(pages: WorkPage[], source: string, target: string, sourceHandle: string, targetHandle: string) {
  const owner = pages.find((page) => page.nodes.some((node) => node.id === source))
  if (!owner) return
  owner.edges.push(wire(source, target, sourceHandle, targetHandle))
}

function rawId(signal: (typeof SISTEM_FAN_SIGNALS)[number]) {
  return `sf-sig-${signal.tag.toLowerCase()}`
}

function buildSinyalPage(): WorkPage {
  const page = sheet(SECTIONS[0])
  const nodes: AppNode[] = [
    {
      id: 'sf-digital-time-en',
      type: 'digital',
      position: { x: 24, y: 16 },
      data: defaultNodeData('digital', { label: 'Zaman enable', digitalMode: 'on' }),
    },
    {
      id: 'sf-time-60',
      type: 'time',
      position: { x: 24, y: 96 },
      data: defaultNodeData('time', { label: 'Zaman · 60 s', windowSec: SISTEM_FAN_WINDOW_SEC }),
    },
  ]
  const edges: AppEdge[] = []

  SISTEM_FAN_SIGNALS.forEach((signal, index) => {
    const slug = signal.tag.toLowerCase()
    const y = 220 + index * 120
    const signalId = `sf-sig-${slug}`

    nodes.push({
      id: signalId,
      type: 'signal',
      position: { x: 24, y },
      data: defaultNodeData('signal', {
        label: signal.label,
        signalKind: signal.signalKind,
        amplitude: signal.amplitude,
        offset: signal.offset,
        frequency: signal.frequency,
        color: COLORS[index % COLORS.length],
      }),
    })
  })

  page.nodes = nodes
  page.edges = edges
  return page
}

function buildMaPage(): WorkPage {
  const page = sheet(SECTIONS[1])
  page.nodes = SISTEM_FAN_SIGNALS.map((signal, index) => ({
    id: `sf-ma-${signal.tag.toLowerCase()}`,
    type: 'ma' as const,
    position: { x: 24, y: 24 + index * 200 },
    data: defaultNodeData('ma', { label: `${signal.label} MA`, windowSec: SISTEM_FAN_WINDOW_SEC }),
  }))
  return page
}

function buildGradyanPage(): WorkPage {
  const page = sheet(SECTIONS[2])
  const nodes: AppNode[] = []
  const edges: AppEdge[] = []

  SISTEM_FAN_SIGNALS.filter((signal) => signal.gradientEnabled).forEach((signal, index) => {
    const slug = signal.tag.toLowerCase()
    const y = 24 + index * 200
    const deltaId = `sf-sub-dma-${slug}`
    const gradId = `sf-mul-grad-${slug}`
    nodes.push(
      {
        id: deltaId,
        type: 'sub',
        position: { x: 24, y },
        data: defaultNodeData('sub', { label: `${signal.label} ΔMA` }),
      },
      {
        id: gradId,
        type: 'mul',
        position: { x: 260, y },
        data: defaultNodeData('mul', { label: `${signal.label} Gradyan` }),
      },
    )
    edges.push(wire(deltaId, gradId, PORT.signalOut, PORT.signalIn))
  })

  page.nodes = nodes
  page.edges = edges
  return page
}

function buildNormPage(): WorkPage {
  const page = sheet(SECTIONS[3])
  const spanId = 'sf-const-n10'
  const offsetNId = 'sf-const-nneg5'
  const nodes: AppNode[] = [
    kNode(spanId, 24, 16, 'Norm span · 10', 10),
    kNode(offsetNId, 260, 16, 'Norm ofset · −5', -5),
  ]
  const edges: AppEdge[] = []

  SISTEM_FAN_SIGNALS.filter((signal) => signal.gradientEnabled).forEach((signal, index) => {
    const slug = signal.tag.toLowerCase()
    const y = 160 + index * 280
    const altId = `sf-const-alt-${slug}`
    const bandId = `sf-const-band-${slug}`
    const gstepId = `sf-const-gstep-${slug}`
    const subAltId = `sf-sub-alt-${slug}`
    const divBandId = `sf-div-band-${slug}`
    const mulSpanId = `sf-mul-span-${slug}`
    const addOffId = `sf-add-noff-${slug}`
    const normId = `sf-lim-norm-${slug}`
    const divGId = `sf-div-gnorm-${slug}`
    const gnormId = `sf-lim-gnorm-${slug}`
    nodes.push(
      kNode(altId, 24, y + 160, `${signal.label} alt`, signal.normAlt),
      kNode(bandId, 260, y + 160, `${signal.label} bant`, signal.normBand),
      kNode(gstepId, 500, y + 160, `${signal.label} G adım`, signal.gradientStep),
      {
        id: subAltId,
        type: 'sub',
        position: { x: 24, y },
        data: defaultNodeData('sub', { label: `${signal.label} MA−alt` }),
      },
      {
        id: divBandId,
        type: 'div',
        position: { x: 260, y },
        data: defaultNodeData('div', { label: `${signal.label} / bant` }),
      },
      {
        id: mulSpanId,
        type: 'mul',
        position: { x: 500, y },
        data: defaultNodeData('mul', { label: `${signal.label} ×10` }),
      },
      {
        id: addOffId,
        type: 'add',
        position: { x: 740, y },
        data: defaultNodeData('add', { label: `${signal.label} −5` }),
      },
      {
        id: normId,
        type: 'limit',
        position: { x: 980, y },
        data: defaultNodeData('limit', { label: `${signal.label} Norm`, limitMin: -5, limitMax: 5 }),
      },
      {
        id: divGId,
        type: 'div',
        position: { x: 740, y: y + 160 },
        data: defaultNodeData('div', { label: `${signal.label} G / adım` }),
      },
      {
        id: gnormId,
        type: 'limit',
        position: { x: 980, y: y + 160 },
        data: defaultNodeData('limit', { label: `${signal.label} G-norm`, limitMin: -5, limitMax: 5 }),
      },
    )
    edges.push(
      wire(altId, subAltId, PORT.signalOut, PORT.signalIn2),
      wire(subAltId, divBandId, PORT.signalOut, PORT.signalIn),
      wire(bandId, divBandId, PORT.signalOut, PORT.signalIn2),
      wire(divBandId, mulSpanId, PORT.signalOut, PORT.signalIn),
      wire(spanId, mulSpanId, PORT.signalOut, PORT.signalIn2),
      wire(mulSpanId, addOffId, PORT.signalOut, PORT.signalIn),
      wire(offsetNId, addOffId, PORT.signalOut, PORT.signalIn2),
      wire(addOffId, normId, PORT.signalOut, PORT.signalIn),
      wire(gstepId, divGId, PORT.signalOut, PORT.signalIn2),
      wire(divGId, gnormId, PORT.signalOut, PORT.signalIn),
    )
  })

  page.nodes = nodes
  page.edges = edges
  return page
}

function wireAcross(pages: WorkPage[]) {
  const timeId = 'sf-time-60'
  addWire(pages, 'sf-digital-time-en', timeId, PORT.boolOut, PORT.boolIn)

  SISTEM_FAN_SIGNALS.forEach((signal) => {
    const slug = signal.tag.toLowerCase()
    const pv = rawId(signal)
    const maId = `sf-ma-${slug}`
    addWire(pages, pv, maId, PORT.signalOut, PORT.signalIn)
    addWire(pages, timeId, maId, PORT.signalOut, PORT.timeIn)
    addWire(pages, timeId, maId, PORT.signalOut, PORT.timeIn2)

    if (!signal.gradientEnabled) return

    const gradId = `sf-mul-grad-${slug}`
    const deltaId = `sf-sub-dma-${slug}`
    addWire(pages, timeId, gradId, PORT.signalOut, PORT.signalIn2)
    addWire(pages, maId, deltaId, PORT.signalOut, signal.gradientInvert ? PORT.signalIn2 : PORT.signalIn)
    addWire(pages, maId, deltaId, PORT.signalOut2, signal.gradientInvert ? PORT.signalIn : PORT.signalIn2)
    addWire(pages, maId, `sf-sub-alt-${slug}`, PORT.signalOut, PORT.signalIn)
    addWire(pages, gradId, `sf-div-gnorm-${slug}`, PORT.signalOut, PORT.signalIn)
  })
}

export function createSistemFanPages(): WorkPage[] {
  const pages = [buildSinyalPage(), buildMaPage(), buildGradyanPage(), buildNormPage()]
  wireAcross(pages)
  return syncSheetLists(pages)
}

export function isSistemFanSheet(page: WorkPage): boolean {
  return page.family === SISTEM_FAN_FAMILY || page.title === 'Sistem Fan'
}

export function hasSistemFanSet(pages: WorkPage[]): boolean {
  const sections = new Set(pages.filter((page) => page.family === SISTEM_FAN_FAMILY).map((page) => page.section))
  return SECTIONS.every((item) => sections.has(item.section))
}

/** İlk sürüm demo sayfası (Sinyal A…D); bozuk db yedeği. */
export function hasLegacyDemoPages(pages: WorkPage[]): boolean {
  return pages.some((page) =>
    page.nodes.some(
      (node) =>
        /-(sig-[a-d])($|-)/.test(node.id) ||
        /-(time-5|time-10)$/.test(node.id) ||
        String(node.data?.label ?? '').startsWith('Sinyal A ·'),
    ),
  )
}

export function isAuthoritativeSistemFanWorkbench(pages: WorkPage[]): boolean {
  return hasSistemFanSet(pages) && !hasLegacyDemoPages(pages)
}

function hasLegacyConnectors(pages: WorkPage[]) {
  return pages.some((page) =>
    page.nodes.some(
      (node) =>
        String(node.type) === 'connIn' ||
        String(node.type) === 'connOut' ||
        node.id.startsWith('sf-add-pv-') ||
        node.id.startsWith('sf-const-off-') ||
        node.id === 'sf-const-dongu' ||
        node.id === 'sf-trig-dongu' ||
        node.type === 'trig' ||
        node.id.startsWith('sf-ma-prev-'),
    ) ||
      page.edges.some((edge) => edge.sourceHandle === PORT.timeOut),
  )
}

function hasCrossPageWires(pages: WorkPage[]) {
  const owner = new Map<string, string>()
  for (const page of pages) {
    for (const node of page.nodes) owner.set(node.id, page.id)
  }
  return pages.some((page) =>
    page.edges.some((edge) => {
      const sourcePage = owner.get(edge.source)
      const targetPage = owner.get(edge.target)
      return Boolean(sourcePage && targetPage && sourcePage !== targetPage)
    }),
  )
}

export function ensureSistemFanPages(pages: WorkPage[]): { pages: WorkPage[]; added: WorkPage | null } {
  if (
    hasSistemFanSet(pages) &&
    !hasLegacyConnectors(pages) &&
    hasCrossPageWires(pages)
  ) {
    return { pages: syncSheetLists(pages), added: null }
  }
  const rest = pages.filter((page) => !isSistemFanSheet(page))
  const created = createSistemFanPages()
  return { pages: [...created, ...rest], added: created[0] }
}

export function sortPages(pages: WorkPage[]): WorkPage[] {
  return [...pages].sort((a, b) => {
    const left = Number(a.name)
    const right = Number(b.name)
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right
    return a.name.localeCompare(b.name, 'tr')
  })
}
