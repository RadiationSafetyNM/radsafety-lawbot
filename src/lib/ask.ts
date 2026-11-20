// 질문 1건 → 검색 → 답변.
// 기준 구현은 radsafety-laws/scripts/_ask.py 다. 아래 상수·순서·문자열은 그 파일과 같아야 한다 —
// 임베딩 규약(모델·taskType·차원·재정규화)이 어긋나면 에러 없이 검색 순위만 나빠진다.
import { env } from './env';
import { SYS, SYS_UPCOMING } from './prompt';
import { pending, type Pending } from './tracker';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const EMB_MODEL = 'gemini-embedding-001';
const EMB_DIM = 1024;
const GEN_MODEL = 'gemini-3.6-flash';
const TOPK = 5;
const CAP = 20000;
const UP_MAX = 8;
const UP_CAP = 6000;

type Row = {
    chunk_id: string;
    content: string;
    metadata: Record<string, string>;
    effective_from: string;
    effective_to?: string | null;
    similarity?: number;
};

export type Source = {
    title: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    content: string;
};
export type Answer = { answer: string; asOf: string; sources: Source[]; upcoming: Source[]; pending: Pending[] };

const title = (r: Row) =>
    `${r.metadata.law_title ?? '?'} ${r.metadata.article ?? ''}${r.metadata.subunit ?? ''}`.trim();

const kdate = (d: string) => {
    const [y, m, dd] = d.split('-');
    return `${y}년 ${Number(m)}월 ${Number(dd)}일`;
};

/** 한국 날짜 오늘(YYYY-MM-DD). DB 의 lawbot_today() 와 같은 기준. */
export const todayKST = () =>
    new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function embedQuery(q: string): Promise<number[]> {
    const r = await fetch(`${GEMINI}/models/${EMB_MODEL}:embedContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': env('GEMINI_API_KEY'), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: `models/${EMB_MODEL}`,
            content: { parts: [{ text: q }] },
            taskType: 'RETRIEVAL_QUERY',
            outputDimensionality: EMB_DIM,
        }),
    });
    if (!r.ok) throw new Error(`임베딩 실패 ${r.status}`);
    const v: number[] = (await r.json()).embedding.values;
    if (v.length !== EMB_DIM) throw new Error(`임베딩 차원 ${v.length} ≠ ${EMB_DIM}`);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) + 1e-9; // 절단 후 재정규화
    return v.map((x) => x / norm);
}

async function rpc<T>(name: string, body: unknown): Promise<T> {
    const key = env('SUPABASE_SECRET_KEY');
    const r = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`검색 실패 ${name} ${r.status}`);
    return r.json();
}

function buildPrompt(q: string, hits: Row[], up: Row[], asOf: string): string {
    const ctx = hits
        .map((h, i) => {
            const note = ` (시행 ${h.effective_from}${h.effective_to ? `, ${h.effective_to} 삭제 또는 개정 예정` : ''})`;
            return `[자료 ${i + 1}] ${title(h)}${note}\n${h.content.slice(0, CAP)}`;
        })
        .join('\n\n---\n\n');
    let p = `${SYS}\n${SYS_UPCOMING}\n\n기준일: ${asOf}\n\n[근거 자료]\n${ctx}`;
    if (up.length)
        p +=
            '\n\n[시행예정 자료]\n' +
            up
                .map(
                    (u, i) =>
                        `[예정 ${i + 1}] ${title(u)} — ${kdate(u.effective_from)}부터 시행\n${u.content.slice(0, UP_CAP)}`,
                )
                .join('\n\n---\n\n');
    return `${p}\n\n[질문]\n${q}`;
}

async function generate(prompt: string): Promise<string> {
    const r = await fetch(`${GEMINI}/models/${GEN_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': env('GEMINI_API_KEY'), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0 },
        }),
    });
    if (!r.ok) throw new Error(`생성 실패 ${r.status}`);
    const d = await r.json();
    const txt = (d.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();
    if (!txt) throw new Error(`생성 빈 응답 (${d.candidates?.[0]?.finishReason ?? '?'})`);
    return txt;
}

const toSource = (r: Row): Source => ({
    title: title(r),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to ?? null,
    content: r.content,
});

export async function ask(question: string, asOf?: string): Promise<Answer> {
    const when = asOf ?? todayKST();
    const vec = '[' + (await embedQuery(question)).map((x) => x.toFixed(7)).join(',') + ']';
    const hits = await rpc<Row[]>('lawbot_match', { query_embedding: vec, match_count: TOPK, as_of: when });
    const up = hits.length
        ? (await rpc<Row[]>('lawbot_upcoming', { chunk_ids: hits.map((h) => h.chunk_id), as_of: when })).slice(0, UP_MAX)
        : [];
    const answer = await generate(buildPrompt(question, hits, up, when));
    return {
        answer, asOf: when, sources: hits.map(toSource), upcoming: up.map(toSource),
        pending: pending(question, hits),   // 공포 전 동향 — 생성에는 넘기지 않았다
    };
}
