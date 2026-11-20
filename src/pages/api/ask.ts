import type { APIRoute } from 'astro';
import { ask } from '../../lib/ask';

const MAX_Q = 500;

export const POST: APIRoute = async ({ request }) => {
    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    let q = '';
    let asOf: string | undefined;
    try {
        const b = await request.json();
        q = String(b.question ?? '').trim();
        if (typeof b.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.asOf)) asOf = b.asOf;
    } catch {
        return json({ error: '요청 형식이 올바르지 않습니다' }, 400);
    }
    if (!q) return json({ error: '질문을 입력해 주십시오' }, 400);
    if (q.length > MAX_Q) return json({ error: `질문은 ${MAX_Q}자 이내로 써 주십시오` }, 400);
    try {
        return json(await ask(q, asOf));
    } catch (e) {
        console.error('[lawbot] ask 실패', e);
        return json({ error: '답변을 만들지 못했습니다. 잠시 뒤 다시 시도해 주십시오.' }, 502);
    }
};
