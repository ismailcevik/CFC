export const CFC = {
  width: 176,
  headerH: 26,
  valueH: 22,
  rowH: 24,
} as const

export function cfcPinTop(row: number): number {
  return CFC.headerH + CFC.valueH + row * CFC.rowH + CFC.rowH / 2
}
