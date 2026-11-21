import type { APIRoute } from 'astro';
import { insert } from '../../lib/db';

// "이상한 답변" 신고 — 접근 코드 통과한 요청만 닿는다(미들웨어). 테이블 = sql/002_feedback.sql.
// IP·쿠키는 적지 않는다. 길이는 잘라서 받는다(악용·실수로 큰 본문이 들어오지 않게).
const cut = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

export const POST: APIRoute = async ({ request }) => {
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    let b: Record<string, unknown>;
    try { b = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않습니다' }, 400); }
    const question = cut(b.question, 500), answer = cut(b.answer, 8000);
    if (!question || !answer) return json({ error: '질문과 답변이 필요합니다' }, 400);
    const sources = (Array.isArray(b.sources) ? b.sources : []).slice(0, 10).map((s) => ({
        title: cut((s as Record<string, unknown>)?.title, 300),
        effectiveFrom: cut((s as Record<string, unknown>)?.effectiveFrom, 10),
    }));
    const asOf = typeof b.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.asOf) ? b.asOf : null;
    try {
        await insert('lawbot_feedback', { question, answer, sources, as_of: asOf, note: cut(b.note, 1000) || null });
        return json({ ok: true });
    } catch (e) {
        console.error('[lawbot] feedback 기록 실패', e);
        return json({ error: '기록하지 못했습니다. 잠시 뒤 다시 시도해 주십시오.' }, 502);
    }
};
