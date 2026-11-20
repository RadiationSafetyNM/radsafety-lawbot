# radsafety-lawbot — 작업 지침

- 역할 경계: 여기는 **화면·런타임**만. 조문 수집·쪼개기·임베딩·스키마는 `~/projects/radsafety-laws`.
- `src/lib/ask.ts` ↔ `radsafety-laws/scripts/_ask.py` 는 한 쌍이다. 한쪽 상수(모델·TOPK·CAP·프롬프트 조립)를
  바꾸면 다른 쪽도 같이 바꾼다.
- `src/lib/prompt.ts` 직접 수정 금지 — `npm run sync-prompt`.
- 비밀값(`SUPABASE_SECRET_KEY`·`GEMINI_API_KEY`)은 서버 코드에서만 읽는다. `PUBLIC_` 접두로 내보내지 않는다.
- 검증: `npx astro check` → `npm run dev` 로 `/api/ask` 왕복. 생성은 실결제(질문 1건 약 10원).
- 프로젝트 허브(결정·남은 행동): vault `knowledge/01_projects/2026-01_RadSafety-pwa/RadSafety-lawbot/RadSafety-lawbot.md`
