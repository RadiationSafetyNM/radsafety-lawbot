// 개정 예정 메뉴 — 공포되어 시행을 기다리는 조문 중 방사선 관련만 골라 조문 단위로 묶는다.
// 자료는 DB(lawbot_chunks)에서 바로 읽으므로 일일 수집분이 자동으로 반영된다. LLM 을 쓰지 않는다.
//   바뀌는 본문 = 그 날짜에 시작하는 행(effective_from = D) / 현행 본문 = 그 날짜에 끝나는 행(effective_to = D)
//   한 조문에서 일부 항만 바뀌면 그 항의 행만 판본이 갈리므로, 묶음에는 바뀌는 부분만 들어온다.
// 의료기관 관련 여부는 사람이 가른다 — upcoming-review.json. 키가 없는 새 후보는 '분류 전'으로 본 목록에 낸다
// (새 개정이 검토를 기다리느라 숨지 않게).
import { select } from './db';
import { todayKST } from './ask';
import review from './upcoming-review.json';
import tracker from './tracker.json';
import type { Pending } from './tracker';

type Row = { chunk_id: string; content: string; metadata: Record<string, string>; effective_from: string; effective_to: string | null };
export type Seg = { t: 'same' | 'del' | 'add'; text: string; parts?: { s: string; c: boolean }[] };
export type Entry = {
    key: string; date: string; title: string; kind: '개정' | '신설' | '삭제';
    cls: 'medical' | 'other' | 'new'; note: string; diff: Seg[];
};
export type Upcoming = { today: string; confirmed: boolean; medical: Entry[]; other: Entry[]; hidden: number; pending: Pending[] };

const KW = ['방사선', '방사성', '방사능', '핵의학', '피폭', '선량', '동위원소', '특수의료장비', '엑스선'];
const LAW_KW = ['방사선', '원자력'];           // 법령 이름이 이러면 본문 낱말과 무관하게 후보

const clean = (l: string) => l.replace(/\*\*/g, '').replace(/\\([.\-*_])/g, '$1').replace(/\s+$/, '');
/** 비교용 — 개정 꼬리표(<개정 …>·<신설 …>)와 공백 차이는 변경으로 치지 않는다. */
const norm = (l: string) => l.replace(/<(개정|신설|본조신설|전문개정)[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function lines(rows: Row[]): string[] {
    return [...rows]
        .sort((a, b) => a.chunk_id.localeCompare(b.chunk_id, 'ko', { numeric: true }))
        .flatMap((r) => r.content.split('\n'))
        .map(clean)
        .filter((l) => l.trim() && !/^「.+」\s/.test(l.trim()) && !l.startsWith('#'));   // 청크 머리줄·장 제목 제외
}

/** 줄 단위 LCS 비교. 조문 하나라 수백 줄을 넘지 않는다. */
function diff(a: string[], b: string[]): Seg[] {
    const na = a.map(norm), nb = b.map(norm), n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
            L[i][j] = na[i] === nb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out: Seg[] = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && na[i] === nb[j]) { out.push({ t: 'same', text: b[j] }); i++; j++; }
        else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) out.push({ t: 'del', text: a[i++] });   // 지금 조문 먼저
        else out.push({ t: 'add', text: b[j++] });
    }
    return pairMarks(out);
}

/** 낱말 단위 LCS — 두 줄에서 같은 낱말과 다른 낱말을 가른다. 닮은 정도(같은 낱말 비율)도 돌려준다. */
function words(x: string, y: string) {
    const a = x.split(/(?<=\s)/), b = y.split(/(?<=\s)/), n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
            L[i][j] = a[i].trim() === b[j].trim() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const pa: { s: string; c: boolean }[] = [], pb: { s: string; c: boolean }[] = [];
    const push = (arr: { s: string; c: boolean }[], s: string, c: boolean) => {
        const last = arr[arr.length - 1];
        if (last && last.c === c) last.s += s; else arr.push({ s, c });
    };
    let i = 0, j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && a[i].trim() === b[j].trim()) { push(pa, a[i++], false); push(pb, b[j++], false); }
        else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) push(pa, a[i++], true);
        else push(pb, b[j++], true);
    }
    return { pa, pb, sim: L[0][0] / Math.max(n, m) };
}

/** 삭제 묶음 바로 뒤에 추가 묶음이 오면 줄끼리 짝지어, 닮은 줄은 달라진 낱말만 표시한다. */
function pairMarks(segs: Seg[]): Seg[] {
    for (let s = 0; s < segs.length; ) {
        if (segs[s].t !== 'del') { s++; continue; }
        let d = s; while (d < segs.length && segs[d].t === 'del') d++;
        let e = d; while (e < segs.length && segs[e].t === 'add') e++;
        for (let k = 0; k < Math.min(d - s, e - d); k++) {
            const x = segs[s + k], y = segs[d + k];
            const w = words(x.text, y.text);
            if (w.sim >= 0.5) { x.parts = w.pa; y.parts = w.pb; }
        }
        s = e;
    }
    return segs;
}

export async function upcoming(): Promise<Upcoming> {
    const today = todayKST();
    const rows = await select<Row>('lawbot_chunks', {
        select: 'chunk_id,content,metadata,effective_from,effective_to',
        or: `(effective_from.gt.${today},effective_to.gt.${today})`,
    });
    const groups = new Map<string, { date: string; law: string; unit: string; at: string; old: Row[]; neu: Row[] }>();
    const put = (r: Row, date: string, side: 'old' | 'neu') => {
        const m = r.metadata, law = m.law_title ?? '?', unit = m.attachment_no || m.article || '?';
        const key = `${law}|${unit}|${date}`;
        if (!groups.has(key)) groups.set(key, { date, law, unit, at: m.article_title ?? '', old: [], neu: [] });
        groups.get(key)![side].push(r);
    };
    for (const r of rows) {
        if (r.effective_from > today) put(r, r.effective_from, 'neu');
        if (r.effective_to && r.effective_to > today) put(r, r.effective_to, 'old');
    }
    const marks = (review as { items: Record<string, { k: string; note?: string }> }).items;
    const medical: Entry[] = [], other: Entry[] = [];
    let hidden = 0;
    for (const [key, g] of groups) {
        const text = [...g.old, ...g.neu].map((r) => r.content).join('\n');
        if (!KW.some((k) => text.includes(k)) && !LAW_KW.some((k) => g.law.includes(k))) { hidden++; continue; }
        const d = diff(lines(g.old), lines(g.neu));
        if (!d.some((s) => s.t !== 'same')) { hidden++; continue; }     // 꼬리표·머리줄만 다른 판본
        const mk = marks[key];
        const e: Entry = {
            key, date: g.date, diff: d, note: mk?.note ?? '',
            title: g.unit.startsWith('별표') ? `${g.law} ${g.unit}${g.at ? ` — ${g.at}` : ''}` : `${g.law} ${g.unit}${g.at ? `(${g.at})` : ''}`,
            kind: !g.old.length ? '신설' : !g.neu.length ? '삭제' : '개정',
            cls: mk?.k === 'medical' ? 'medical' : mk?.k === 'other' ? 'other' : 'new',
        };
        (e.cls === 'other' ? other : medical).push(e);
    }
    const by = (a: Entry, b: Entry) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko', { numeric: true });
    return {
        today, confirmed: (review as { confirmed: boolean }).confirmed,
        medical: medical.sort(by), other: other.sort(by), hidden, pending: tracker as Pending[],
    };
}
