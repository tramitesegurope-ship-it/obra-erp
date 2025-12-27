import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Use relative asset paths so the built UI works under file:// in Electron.
  base: './',
  plugins: [react()],
})
