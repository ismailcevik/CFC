import { createContext, useContext } from 'react'
import type { RuntimeSnapshot } from './types'

export const emptyRuntime: RuntimeSnapshot = {
  t: 0,
  running: false,
  values: {},
  series: {},
}

export const RuntimeContext = createContext<RuntimeSnapshot>(emptyRuntime)

export function useRuntime(): RuntimeSnapshot {
  return useContext(RuntimeContext)
}

export const WatchContext = createContext<{
  watched: string[]
  isWatched: (id: string) => boolean
}>({
  watched: [],
  isWatched: () => false,
})

export function useWatch() {
  return useContext(WatchContext)
}
