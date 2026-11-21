import { defineMiddleware } from 'astro:middleware';
import { COOKIE, cookieOk } from './lib/gate';

// 접근 코드를 통과한 요청만 화면과 API 에 닿는다. 통과 못 하면 화면은 /enter 로, API 는 401.
export const onRequest = defineMiddleware((ctx, next) => {
    const path = ctx.url.pathname;
    if (path === '/enter' || path === '/api/health' || path.startsWith('/_astro/') || path === '/favicon.svg') return next();
    if (cookieOk(ctx.cookies.get(COOKIE)?.value)) return next();
    if (path.startsWith('/api/'))
        return new Response(JSON.stringify({ error: '접근 코드가 필요합니다' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    return ctx.redirect('/enter');
});
