// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// 전 페이지 서버 렌더 — 접근 코드 확인과 API 키 사용이 모두 서버에서 일어난다.
export default defineConfig({
    output: 'server',
    adapter: vercel(),
    security: { checkOrigin: true },
});
