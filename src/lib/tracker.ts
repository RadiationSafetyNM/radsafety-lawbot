// 개정 추적 대장 — 공포 전 개정 동향. 생성 모델에는 넘기지 않고 답변과 분리해 보여 준다(결정 4).
// 정본: radsafety-laws/data/amendment-tracker.yaml → npm run sync-tracker. 매칭 규칙은 _ask.py 의 pending() 과 같다.
import items from './tracker.json';

export type Pending = {
    id: string;
    title: string;
    law: string;
    current: string;
    proposed: string;
    status: string;
    expected_effective: string;
    confidence: string;
    timeline: { date: string; event: string }[];
    sources: string[];
};

type Item = Pending & { targets?: string[]; keywords?: string[] };
type Hit = { metadata: Record<string, string> };

export function pending(question: string, hits: Hit[]): Pending[] {
    return (items as Item[]).filter((it) => {
        const byKw = (it.keywords ?? []).some((k) => question.includes(k));
        const t = it.targets ?? [];
        const bySrc = hits.some(
            (h) => h.metadata.law_title === it.law && (t.includes(h.metadata.attachment_no) || t.includes(h.metadata.article)),
        );
        return byKw || bySrc;
    });
}
