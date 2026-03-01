import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    // base берётся из env при сборке (GitHub Actions подставляет /repo-name/)
    // локально всегда '/'
    base: process.env.VITE_BASE_PATH || '/',
    server: {
        port: 5173,
        host: true,
        // Локальная разработка: /api/* → localhost:8000
        // Работает только в dev-режиме (npm run dev)
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false
    }
})
