// 질문 1건 → 검색 → 답변.
// 기준 구현은 radsafety-laws/scripts/_ask.py 다. 아래 상수·순서·문자열은 그 파일과 같아야 한다 —
// 임베딩 규약(모델·taskType·차원·재정규화)이 어긋나면 에러 없이 검색 순위만 나빠진다.
import { env } from './env';
import { rpc, select } from './db';
import { SYS, SYS_UPCOMING, SYS_GUIDE, SYS_GUIDE_DIFF } from './prompt';
import { pending, type Pending } from './tracker';
import { expand } from './query';
import { check, type Checks } from './verify';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const EMB_MODEL = 'gemini-embedding-001';
const EMB_DIM = 1024;
const GEN_MODEL = 'gemini-3.6-flash';
const TOPK = 8; // 2026-11-27 5→8 (_ask.py 와 같다 — 근거: radsafety-laws scripts/_topk_eval.py)
const CAP = 20000;
const UP_MAX = 8;
const UP_CAP = 6000;
// 지침(수검 가이드) — 법령과 다른 표·다른 답. 유사도가 이 값을 넘는 조각이 있을 때만 지침 답을 만든다.
// 잠정값(2026-11-27, _ask.py 와 같다). 지침 평가 문항으로 다시 정할 것.
const GUIDE_K = 3;
const GUIDE_MIN = 0.7;
// 차이 한 줄을 위해 넘기는 현행 조문 — 개정된 인용 조문 중 앞의 몇 개만
// 편(Part)으로 거르기 전 후보 수. 가이드는 수검자 종류별 세 편이고 같은 절 제목이 편마다 되풀이된다 —
// 편을 가리지 않으면 병원(허가사용자) 질문에 업무대행자 편 조각이 섞인다. 질문 낱말로 한 편만 고른다(_ask.py 와 같다).
const GUIDE_POOL = 10;
const PARTS: [string, string[]][] = [['Part 2', ['업무대행']], ['Part 3', ['운반', '포장', '운송']]];
const guidePart = (q: string) => PARTS.find(([, words]) => words.some((w) => q.includes(w)))?.[0] ?? 'Part 1';
const DIFF_MAX = 2;
const DIFF_CAP = 5000;

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
type GuideRow = { chunk_id: string; content: string; similarity: number;
    metadata: Record<string, unknown> & { cites_changed?: Changed[] } };
/** 지침이 인용한 조문 중 발간(2022-10) 뒤 개정됐거나 바뀔 예정인 것. 인입 때 계산해 둔 값이다. */
export type Changed = { cite: string; amended: string | null; upcoming: string | null; gone?: boolean };
export type Guide = { answer: string; sources: { title: string; content: string }[]; changed: Changed[] };
export type Answer = { answer: string; asOf: string; sources: Source[]; upcoming: Source[]; pending: Pending[]; checks: Checks;
    guide: Guide | null };

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** 근거 카드·프롬프트 [자료 n] 제목. _ask.py 의 disp() 와 같은 규칙.
 *  조문: "법령 제N조제M항(조 제목)" — 항 라벨 ⑤ 는 '제5항' 으로 푼다.
 *  별표: "법령 별표N 표1 행1~10 — 별표 제목(제N조 관련)". 별표 청크의 article 은 위임 조문이라
 *  그걸 제목에 쓰면 별표가 조문으로 보인다(2026-11-21 수정 전 결함). */
export function title(r: Pick<Row, 'chunk_id' | 'metadata'>): string {
    const m = r.metadata;
    const law = m.law_title ?? '?', at = m.article_title ?? '';
    let sub = m.subunit ?? '';
    if (m.attachment_no) {
        let t = `${law} ${m.attachment_no}`;
        if (sub) t += ` ${sub}`;
        else {
            const pm = /_p(\d+)$/.exec(r.chunk_id);
            if (pm) t += ` (${pm[1]}번째 부분)`;
        }
        return at ? `${t} — ${at}` : t;
    }
    sub = sub.replace(new RegExp(`^([${CIRCLED}])\\s*`), (_, c: string) => `제${CIRCLED.indexOf(c) + 1}항`);
    return `${law} ${m.article ?? ''}${sub}` + (at ? `(${at})` : '');
}

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

/** 지침 조각 제목. _ask.py 의 guide_title() 과 같은 규칙. */
function guideTitle(g: GuideRow): string {
    const m = g.metadata as Record<string, string>;
    const crumbs = [m.part, m.section || m.chapter, m.subsection].filter(Boolean);
    return `수검 가이드(2022) ${crumbs.join(' > ')} (p.${m.printed_pages ?? '?'})`;
}

/** '원자력안전법 시행규칙 제121조' → 기준일 현행 본문. _ask.py 의 current_article() 과 같은 조회. */
async function currentArticle(cite: string, today: string): Promise<string> {
    const i = cite.lastIndexOf(' ');
    const rows = await select<{ content: string }>('lawbot_chunks', {
        select: 'chunk_id,content', 'metadata->>law_title': `eq.${cite.slice(0, i)}`, 'metadata->>article': `eq.${cite.slice(i + 1)}`,
        'metadata->>document_type': 'eq.law', effective_from: `lte.${today}`,
        or: `(effective_to.is.null,effective_to.gt.${today})`, order: 'chunk_id',
    });
    return rows.map((r) => r.content).join('\n').slice(0, DIFF_CAP);
}

/** 「지침 근거」 줄이 가리킨 쪽(p.N)의 조각만 남긴다. 하나도 못 맞추면 전부 둔다. */
function citedOnly<T extends { title: string }>(sources: T[], answer: string): T[] {
    const line = answer.split('\n').find((l) => l.trim().startsWith('「지침 근거」')) ?? '';
    const keep = sources.filter((s) => { const m = /\(p\.[^)]*\)$/.exec(s.title); return !!m && !!line && line.includes(m[0]); });
    return keep.length ? keep : sources;
}

/** 지침 답. 관련 조각이 없으면 null(둘째 칸을 띄우지 않는다). 법령 답과 독립이며, 실패해도 법령 답은 나간다. */
async function askGuide(question: string, vec: string, today: string): Promise<Guide | null> {
    try {
        const part = guidePart(question);
        const hits = (await rpc<GuideRow[]>('lawbot_guide_match', { query_embedding: vec, match_count: GUIDE_POOL }))
            .filter((g) => g.similarity >= GUIDE_MIN && String(g.metadata.part ?? '').startsWith(part))
            .slice(0, GUIDE_K);
        if (!hits.length) return null;
        const body = hits.map((g, i) => `[지침 ${i + 1}] ${guideTitle(g)}\n${g.content.slice(0, CAP)}`).join('\n\n---\n\n');
        const changed: Changed[] = [];
        for (const g of hits)
            for (const c of g.metadata.cites_changed ?? [])
                if (!changed.some((x) => x.cite === c.cite)) changed.push(c);
        // 개정된 인용 조문의 현행 본문 — 차이 한 줄(※ 현행과 다른 점)을 위해서만 넘긴다
        const amended = changed.filter((c) => c.amended).map((c) => c.cite).slice(0, DIFF_MAX);
        const cur = (await Promise.all(amended.map(async (c) => [c, await currentArticle(c, today)] as const))).filter(([, t]) => t);
        let prompt = SYS_GUIDE;
        if (cur.length) prompt += `\n${SYS_GUIDE_DIFF}`;
        prompt += `\n\n[지침 자료]\n${body}`;
        if (cur.length) prompt += '\n\n[현행 조문]\n' + cur.map(([c, t]) => `[현행] ${c}\n${t}`).join('\n\n---\n\n');
        const answer = await generate(`${prompt}\n\n[질문]\n${question}`);
        // 모델이 관련 없다고 본 경우 — 빈 칸을 띄우지 않는다(_ask.py 와 같은 규칙)
        if (answer.includes('「지침 근거」 없음') || answer.slice(0, 40).includes('해당 내용이 없습니다')) return null;
        return { answer, changed, sources: citedOnly(hits.map((g) => ({ title: guideTitle(g), content: g.content })), answer) };
    } catch (e) {
        console.error('[lawbot] 지침 답 실패', e);
        return null;
    }
}

export async function ask(question: string, asOf?: string): Promise<Answer> {
    const when = asOf ?? todayKST();
    const vec = '[' + (await embedQuery(expand(question))).map((x) => x.toFixed(7)).join(',') + ']'; // 검색에만 용어 병기
    const hits = await rpc<Row[]>('lawbot_match', { query_embedding: vec, match_count: TOPK, as_of: when });
    const up = hits.length
        ? (await rpc<Row[]>('lawbot_upcoming', { chunk_ids: hits.map((h) => h.chunk_id), as_of: when })).slice(0, UP_MAX)
        : [];
    const guideP = askGuide(question, vec, when);      // 법령 답과 나란히 만든다(기다리는 시간을 겹친다)
    const answer = await generate(buildPrompt(question, hits, up, when));
    return {
        guide: await guideP,                     // 지침 답(없으면 null) — 법령 답과 섞지 않는다
        answer, asOf: when, sources: hits.map(toSource), upcoming: up.map(toSource),
        pending: pending(question, hits),   // 공포 전 동향 — 생성에는 넘기지 않았다
        // 검증 표시(전문가 보조용 — 막지 않고 경고만). _verify.py 와 같은 규칙.
        checks: check(answer, hits.map((h) => ({ similarity: h.similarity ?? 0, title: title(h), content: h.content })),
                      up.map((u) => u.content)),
    };
}
