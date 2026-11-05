import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dashboard calls the FastAPI backend directly at http://localhost:8000
// (see src/api.ts); the backend allows this page's origin (http://localhost:5173) via CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The project lives in a OneDrive folder, where file-change events are sometimes missed.
    watch: { usePolling: true, interval: 300 },
  },
})
