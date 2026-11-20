# radsafety-lawbot

방사선안전 법령 질의 챗봇의 **화면과 런타임**. 질문을 받아 현행 조문을 검색하고 답한다.
바뀔 예정인 조문은 "○월 ○일부터" 한 줄로 덧붙인다.

- 데이터·임베딩 인입: [`radsafety-laws`](https://github.com/RadiationSafetyNM/radsafety-laws) (이 저장소는 읽기만 한다)
- 검색 DB: Supabase pgvector — RPC `lawbot_match(as_of)` · `lawbot_upcoming`
- 임베딩·생성: Gemini (`gemini-embedding-001` 1024차원 · `gemini-3.6-flash`)
- 배포: Astro SSR + Vercel

## 실행

```bash
cp .env.example .env   # 값 채우기
npm install
npm run dev            # http://localhost:4321
```

## 지켜야 할 것

- `src/lib/ask.ts` 는 `radsafety-laws/scripts/_ask.py`(기준 구현)와 같은 규약을 쓴다.
  임베딩 모델·taskType·차원·재정규화가 어긋나면 **에러 없이 검색 순위만 나빠진다.**
- `src/lib/prompt.ts` 는 자동 생성물이다. 프롬프트는 `radsafety-laws/scripts/_prompt.py` 에서 고치고
  `npm run sync-prompt` 로 옮긴다(평가가 그 문자열로 채점된다).
- 1차는 접근 코드(`LAWBOT_ACCESS_CODE`)로 막은 비공개 운영이다. 회원 로그인 연결은 2차.
