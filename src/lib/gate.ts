// 1차 비공개 운영용 접근 코드. 회원 로그인 연결(2차) 전까지의 임시 문지기다.
// 쿠키에는 코드 자체가 아니라 그 해시를 둔다.
//
// 시도 횟수 제한(2026-11-21): 틀린 시도를 DB(lawbot_gate_fail, sql/001_gate_fail.sql)에 적고
//   · IP 하나가 15분에 PER_IP 번 틀리면 그 IP 를 막는다
//   · 전체가 1시간에 GLOBAL 번 틀리면(여러 IP 로 나눠 찍기) 모두를 잠시 막는다
// IP 원문은 저장하지 않는다 — 접근 코드를 소금으로 섞은 해시 앞 16자만 쓴다.
// DB 를 못 읽으면 막는다(fail closed): 제한을 확인할 수 없는데 무한 시도를 허용하지 않는다.
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from './env';
import { rpc } from './db';

export const COOKIE = 'lawbot_gate';
export const PER_IP = 5;
export const GLOBAL = 30;
const hash = (s: string) => createHash('sha256').update('lawbot:' + s).digest('hex');

export const tokenFor = (code: string) => hash(code);
export function codeOk(code: string): boolean {
    const a = Buffer.from(hash(code)), b = Buffer.from(hash(env('LAWBOT_ACCESS_CODE')));
    return timingSafeEqual(a, b);
}
export function cookieOk(v: string | undefined): boolean {
    if (!v) return false;
    const a = Buffer.from(v), b = Buffer.from(hash(env('LAWBOT_ACCESS_CODE')));
    return a.length === b.length && timingSafeEqual(a, b);
}

/** IP → 저장용 식별자(되돌릴 수 없음). */
export const whoOf = (ip: string) =>
    createHash('sha256').update(`gate:${env('LAWBOT_ACCESS_CODE')}:${ip}`).digest('hex').slice(0, 16);

export type GateState = 'ok' | 'ip' | 'global' | 'unknown';

/** 지금 이 IP 가 시도해도 되는가. */
export async function gateState(who: string): Promise<GateState> {
    try {
        const [s] = await rpc<{ mine: number; total: number }[]>('lawbot_gate_status', { p_who: who });
        if (s.mine >= PER_IP) return 'ip';
        if (s.total >= GLOBAL) return 'global';
        return 'ok';
    } catch (e) {
        console.error('[lawbot] gate 상태 확인 실패', e);
        return 'unknown';
    }
}

export async function recordFail(who: string): Promise<void> {
    try {
        await rpc('lawbot_gate_fail', { p_who: who });
    } catch (e) {
        console.error('[lawbot] gate 실패 기록 실패', e);
    }
}
