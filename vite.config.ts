import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { workbenchDbPlugin } from './server/workbenchDbPlugin.ts'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), workbenchDbPlugin(projectRoot)],
  server: {
    host: true,
    port: 5173,
  },
})
