// Vercel에서는 Railway의 공개 HTTPS 주소를 VITE_API_BASE_URL로 설정한다.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:4000' : '');
