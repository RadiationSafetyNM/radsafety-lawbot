// 검색용 질의 다듬기 — 사용자 용어를 법령 용어와 병기한다.
// 기준 구현은 radsafety-laws/scripts/_query.py, 사전 정본은 radsafety-laws/data/query-terms.yaml.
// terms.json 은 `npm run sync-terms` 산출물이라 직접 고치지 않는다.
// 결과는 임베딩에만 쓰고, 생성 모델에는 사용자 원문 질문을 넘긴다.
import terms from './terms.json';

export function expand(question: string): string {
    let q = question;
    for (const { term, legal } of terms as { term: string; legal: string }[]) {
        if (q.includes(term) && !q.includes(legal)) {
            const i = q.indexOf(term) + term.length;
            q = `${q.slice(0, i)}(${legal})${q.slice(i)}`;
        }
    }
    return q;
}
