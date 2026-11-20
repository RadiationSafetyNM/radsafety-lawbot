// 1차 비공개 운영용 접근 코드. 회원 로그인 연결(2차) 전까지의 임시 문지기다.
// 쿠키에는 코드 자체가 아니라 그 해시를 둔다.
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from './env';

export const COOKIE = 'lawbot_gate';
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
