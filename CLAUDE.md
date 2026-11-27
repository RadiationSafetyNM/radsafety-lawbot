# radsafety-lawbot — 작업 지침

- 역할 경계: 여기는 **화면·런타임**만. 조문 수집·쪼개기·임베딩·스키마는 `~/projects/radsafety-laws`.
- `src/lib/ask.ts` ↔ `radsafety-laws/scripts/_ask.py` 는 한 쌍이다. 한쪽 상수(모델·TOPK·CAP·프롬프트 조립)를
  바꾸면 다른 쪽도 같이 바꾼다.
- `src/lib/prompt.ts` 직접 수정 금지 — `npm run sync-prompt`. `src/lib/terms.json`(질의 용어 사전)도 같다 — `npm run sync-terms`.
- `src/lib/query.ts` ↔ `radsafety-laws/scripts/_query.py` 도 한 쌍이다(용어 병기 규칙).
- 비밀값(`SUPABASE_SECRET_KEY`·`GEMINI_API_KEY`)은 서버 코드에서만 읽는다. `PUBLIC_` 접두로 내보내지 않는다.
- 검증: `npx astro check` → `npm run dev` 로 `/api/ask` 왕복. 생성은 실결제(질문 1건 약 10원).
- 프로젝트 허브(결정·남은 행동): vault `knowledge/01_projects/2026-01_RadSafety-pwa/RadSafety-lawbot/RadSafety-lawbot.md`
- 접근 코드 시도 제한(2026-11-21): 실패 기록은 DB `lawbot_gate_fail`(`sql/001_gate_fail.sql`, Supabase SQL Editor 로 프로젝트마다 1회 적용). 15분 IP당 5회·1시간 전체 30회, DB 불가 시 막음. 운영 DB 로 옮길 때 이 SQL 도 같이 적용할 것.
- "이상한 답변" 신고(2026-11-22): 답변 아래 버튼 → `/api/feedback` → DB `lawbot_feedback`(`sql/002_feedback.sql`). 목록 = `npm run feedback`(`--all`·`--done <id…>`). 신고는 용어 사전·평가셋·프롬프트 개선의 입력.
- 검증 표시(2026-11-22, 전문가 보조용 — 막지 않고 경고): `src/lib/verify.ts` ↔ `radsafety-laws/scripts/_verify.py` 한 쌍. 근거 강도(OFF 0.66·WEAK 0.72)·원문에 없는 수치·「근거」 인용 대조. 정규식 경계는 파이썬 \w 를 `\p{L}\p{N}_`(u 플래그)로 흉내 낸다.
- 개정 예정 메뉴(2026-11-27): `/upcoming` — `src/lib/upcoming.ts` 가 DB 에서 시행예정·변경예정 행을 읽어 조문 단위로 묶고 현행과 줄·낱말 단위로 비교한다(LLM 없음, 일일 수집분 자동 반영). 방사선 낱말 필터로 후보를 뽑고, 의료기관 관련 여부와 한 줄 요약은 `src/lib/upcoming-review.json`(사람이 분류, 키 = 법령|조문|시행일). 키가 없는 새 후보는 '분류 전' 표시로 본 목록에 나온다. 요약은 원문을 보고 손으로 쓴다 — 생성하지 않는다.
