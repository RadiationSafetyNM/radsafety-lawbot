-- 접근 코드 실패 기록 — 입력 시도 횟수 제한용 (2026-11-21).
--
-- 왜 DB 인가: Vercel 은 서버리스라 요청마다 다른 인스턴스가 받을 수 있어 메모리 카운터가
-- 의미가 없다. 실패만 한 줄씩 적고, 최근 실패 수로 막는다.
-- 개인정보: IP 원문은 적지 않는다. 서버가 sha256(소금 + IP) 앞 16자만 넘긴다.
-- 규칙(서버 코드 src/lib/gate.ts 가 판정): IP 하나가 15분에 5번 틀리면 그 IP 를 막고,
-- 전체가 1시간에 30번 틀리면(여러 IP 로 나눠 찍는 경우) 모두를 잠시 막는다.
-- 기록은 하루 지나면 지운다(실패를 적을 때마다 정리).
--
-- 적용: Supabase SQL Editor 에서 1회 실행. 10-30 이후 새 테이블은 권한을 명시해야 한다.

create table if not exists lawbot_gate_fail (
    id  bigserial primary key,
    who text        not null,                 -- sha256(소금+IP) 앞 16자
    at  timestamptz not null default now()
);
create index if not exists lawbot_gate_fail_who_at on lawbot_gate_fail (who, at);
create index if not exists lawbot_gate_fail_at on lawbot_gate_fail (at);

alter table lawbot_gate_fail enable row level security;   -- 정책 없음 = anon·authenticated 접근 0
revoke all on lawbot_gate_fail from anon, authenticated;
grant select, insert, delete on lawbot_gate_fail to service_role;
grant usage on sequence lawbot_gate_fail_id_seq to service_role;

-- 최근 실패 수: (이 IP 의 15분 실패, 전체 1시간 실패)
create or replace function lawbot_gate_status(p_who text)
returns table (mine int, total int)
language sql stable
as $$
    select
        (select count(*) from lawbot_gate_fail where who = p_who and at > now() - interval '15 minutes')::int,
        (select count(*) from lawbot_gate_fail where at > now() - interval '1 hour')::int;
$$;

-- 실패 한 건 기록 + 하루 지난 기록 정리
create or replace function lawbot_gate_fail(p_who text)
returns void
language sql
as $$
    delete from lawbot_gate_fail where at < now() - interval '1 day';
    insert into lawbot_gate_fail (who) values (p_who);
$$;

revoke all on function lawbot_gate_status(text) from public, anon, authenticated;
revoke all on function lawbot_gate_fail(text) from public, anon, authenticated;
grant execute on function lawbot_gate_status(text) to service_role;
grant execute on function lawbot_gate_fail(text) to service_role;
