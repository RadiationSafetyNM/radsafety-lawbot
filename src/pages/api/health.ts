import type { APIRoute } from 'astro';

// 배포 점검용 — 값은 절대 내보내지 않는다. 환경값이 "있나/형식이 맞나"와 DB 왕복 상태 코드만.
// 접근 코드 없이 열린다(미들웨어 예외). 2026-11-21 첫 배포 때 503 원인을 콘솔 없이 가리려고 신설.
const NAMES = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'GEMINI_API_KEY', 'LAWBOT_ACCESS_CODE'] as const;

const read = (n: string) =>
    process.env[n] ?? (import.meta.env as Record<string, string | undefined>)[n];

export const GET: APIRoute = async () => {
    const env = Object.fromEntries(NAMES.map((n) => [n, Boolean(read(n))]));
    const url = read('SUPABASE_URL') ?? '';
    const key = read('SUPABASE_SECRET_KEY') ?? '';
    const shape = {
        SUPABASE_URL: /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url),
        SUPABASE_SECRET_KEY: key.startsWith('sb_secret_'),
        trailingSpace: NAMES.some((n) => { const v = read(n) ?? ''; return v !== v.trim(); }),
    };
    let db: number | string = 'skipped';
    if (url && key) {
        try {
            const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/lawbot_gate_status`, {
                method: 'POST',
                headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ p_who: 'health' }),
            });
            db = r.status;
        } catch {
            db = 'network-error';
        }
    }
    const ok = Object.values(env).every(Boolean) && shape.SUPABASE_URL && shape.SUPABASE_SECRET_KEY && db === 200;
    return new Response(JSON.stringify({ ok, env, shape, db }), {
        status: ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
};
