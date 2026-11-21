-- "이상한 답변" 신고 기록 (2026-11-22).
-- 앱의 답변 아래 버튼을 누르면 질문·답변·근거 조문 제목·기준일·메모가 한 줄로 남는다.
-- 개선 재료: 용어 사전(query-terms.yaml) 추가, 평가셋 문항 추가, 프롬프트 수정.
-- 개인정보: IP·쿠키·사용자 식별자는 적지 않는다. 질문 원문은 남으므로 화면에 안내한다.
-- 적용: Supabase SQL Editor 에서 1회 실행. 10-30 이후 새 테이블은 권한을 명시해야 한다.

create table if not exists lawbot_feedback (
    id       bigserial primary key,
    at       timestamptz not null default now(),
    question text        not null,
    answer   text        not null,
    sources  jsonb       not null default '[]'::jsonb,   -- [{title, effectiveFrom}]
    as_of    date,
    note     text,                                      -- 사용자가 적은 "무엇이 이상한지"(선택)
    status   text        not null default 'new'         -- new → 처리 후 done/ignored (사람이 바꾼다)
);
create index if not exists lawbot_feedback_at on lawbot_feedback (at desc);

alter table lawbot_feedback enable row level security;   -- 정책 없음 = anon·authenticated 접근 0
revoke all on lawbot_feedback from anon, authenticated;
grant select, insert, update, delete on lawbot_feedback to service_role;
grant usage on sequence lawbot_feedback_id_seq to service_role;
