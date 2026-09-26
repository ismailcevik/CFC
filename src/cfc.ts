export const CFC = {
  width: 232,
  headerH: 36,
  valueH: 22,
  rowH: 28,
} as const

export const SHEET = {
  width: 248,
  height: 96,
  pinTop: 68,
} as const

export function cfcBlockHeight(rows: number): number {
  return CFC.headerH + CFC.valueH + Math.max(1, rows) * CFC.rowH
}

export function cfcPinTop(row: number): number {
  return CFC.headerH + CFC.valueH + row * CFC.rowH + CFC.rowH / 2
}

/** Hop oku sol giriş pininin görünür dairesine kadar uzansın (handle dış kenarda kalır). */
export const CFC_HOP_PIN_SNAP = 10

