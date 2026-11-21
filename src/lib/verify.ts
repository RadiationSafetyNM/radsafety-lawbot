// 답변 검증 표시 — 전문가 보조용(2026-11-22). 막지 않고 경고만 붙인다.
// 기준 구현 = radsafety-laws/scripts/_verify.py (+ _answer_audit.py·_answer_keys.py 의 수치 규칙).
// 한쪽을 고치면 다른 쪽도 고친다(2026-11-22 동등성 시험: DB 전 2,637행 원문 수치 + 답변 표본 일치).
//   ① 근거 강도  top-1 유사도 < OFF → 'off'(범위 밖일 수 있음), < WEAK → 'weak'(근거 약함)
//   ② 숫자 대조  답변의 값이 회수 원문 어디에도 없으면 표시
//   ③ 인용 대조  「근거」 줄의 제N조·별표N 이 회수 조문 제목에 없으면 표시
export const OFF = 0.66, WEAK = 0.72;

// 파이썬 \w(유니코드 글자·숫자)를 흉내 낸 경계 — JS \w·\b 는 ASCII 만 본다. 한글 자모(ㆍ 등)까지
// 포함해야 "5ㆍ18" 의 18 이 값으로 잡히지 않는다(동등성 시험에서 발견).
const W = '\\p{L}\\p{N}_';
const UNIT = 'mSv|밀리시버트|Sv|rem|Bq|TBq|GBq|MBq|mCi|Ci|C/kg|R|mR|mA|kV|'
    + '년|개월|일|시간|분|명|배|퍼센트|%|m|㎡|㎥|cm|mm';
const NUM = `(?<![${W}.])\\d+(?:\\.\\d+)?(?:e-?\\d+)?`;
const VAL2 = new RegExp(`(${NUM})\\s*(?:${UNIT})(?![A-Za-z])`, 'gu');
const SCI = new RegExp(`(?<![${W}.])\\d+(?:\\.\\d+)?e-?\\d+`, 'gu');
const ANYNUM = new RegExp(NUM, 'gu');
const STRIP = new RegExp(
    '제\\s*\\d+\\s*(?:조|항|호|목|란|장|절)(?:의\\d+)?|별표\\s*\\d+|별지\\s*제?\\d+호?|<개정[^>]*>|'
    + '\\d{4}\\s*[.년]\\s*\\d{1,2}\\s*[.월]\\s*\\d{1,2}\\s*일?|\\d{4}\\s*년|제\\s*\\d+\\s*호', 'g');
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5',
    '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

export function canon(s: string): string {
    if (!s) return '';
    s = s.replace(/[−–]/g, '-');
    s = s.replace(/<sup>([\s\S]*?)<\/sup>/g, '^$1');
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (c) => SUP[c]);
    s = s.replace(/(?<=\d),(?=\d{3})/g, '');
    s = s.replace(/(\d+(?:\.\d+)?)\s*[×xX*]\s*10\s*\^?\s*([+-]?\d+)/g, (_, a, b) => `${a}e${parseInt(b, 10)}`);
    s = s.replace(/(\d+(?:\.\d+)?)\s*[Ee]\s*([+-]\d+)/g, (_, a, b) => `${a}e${parseInt(b, 10)}`);
    return s;
}

/** 답변측 — 단위 붙은 값·과학적 표기만(목록 번호·연도 배제). 한글 조사가 바로 붙어도 잡는다. */
export function answerValues(text: string): Set<string> {
    const t = canon(text).replace(STRIP, ' ');
    const out = new Set<string>();
    for (const m of t.matchAll(SCI)) out.add(canon(m[0]).trim());
    for (const m of t.matchAll(VAL2)) out.add(canon(m[1]).trim());
    out.delete('');
    return out;
}

/** 원문측 — 모든 숫자(표 셀은 단위가 헤더에만 있다). 오탐보다 미탐 쪽으로 기운다. */
export function sourceValues(text: string): Set<string> {
    const t = canon(text).replace(STRIP, ' ');
    return new Set(t.match(ANYNUM) ?? []);
}

const REF = /제\s*\d+\s*조(?:\s*의\s*\d+)?|별표\s*\d+(?:\s*의\s*\d+)?/g;
const sq = (s: string) => s.replace(/\s+/g, '');

export type Checks = {
    strength: 'ok' | 'weak' | 'off';
    top: number;
    unsupportedNumbers: string[];
    uncitedRefs: string[];
};

export function check(answer: string, hits: { similarity: number; title: string; content: string }[],
                      extraTexts: string[] = []): Checks {
    const top = hits.reduce((m, h) => Math.max(m, h.similarity ?? 0), 0);
    const src = new Set<string>();
    for (const t of [...hits.map((h) => h.content), ...extraTexts]) for (const v of sourceValues(t)) src.add(v);
    const unsupportedNumbers = [...answerValues(answer)].filter((v) => !src.has(v)).sort();
    let line = answer.split('\n').find((l) => l.trim().startsWith('「근거」')) ?? '';
    line = line.replace(/\([^)]*관련\)/g, '');
    const pool = sq(hits.map((h) => h.title).join(' '));
    const uncitedRefs = [...new Set((line.match(REF) ?? []).map(sq).filter((r) => !pool.includes(r)))].sort();
    return {
        strength: top < OFF ? 'off' : top < WEAK ? 'weak' : 'ok',
        top: Math.round(top * 1000) / 1000,
        unsupportedNumbers, uncitedRefs,
    };
}
