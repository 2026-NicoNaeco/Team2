import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL
  if (process.env.VERCEL && !/^https:\/\/[^/]+\/?$/.test(apiBaseUrl?.trim() ?? '')) {
    throw new Error('Vercel 환경변수 VITE_API_BASE_URL에 Railway 백엔드 HTTPS 기본 주소를 설정하세요.')
  }
  return { plugins: [react(), tailwindcss()] }
})
