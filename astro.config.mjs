// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// 전 페이지 서버 렌더 — 접근 코드 확인과 API 키 사용이 모두 서버에서 일어난다.
export default defineConfig({
    output: 'server',
    adapter: vercel(),
    security: {
        checkOrigin: true,
        // 프록시(Vercel) 뒤에서 자기 주소를 알게 하는 허용 목록(2026-11-21).
        // 이게 없으면 Astro 5.18 은 X-Forwarded-Host 를 믿지 않아 요청 주소를 https://localhost 로
        // 잡고, 브라우저 Origin(https://radsafety-lawbot.vercel.app)과 달라 checkOrigin 이
        // 접근 코드 폼 전송을 403 "Cross-site POST form submissions are forbidden" 으로 막는다.
        // 사용자 도메인을 붙이면 여기에 추가할 것.
        allowedDomains: [{ protocol: 'https', hostname: '*.vercel.app' }],
    },
});
