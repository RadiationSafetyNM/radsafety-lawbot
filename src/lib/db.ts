// Supabase PostgREST RPC — 서버 전용(Secret key 는 RLS 를 건너뛴다. 브라우저로 내보내지 않는다).
import { env } from './env';

export async function rpc<T>(name: string, body: unknown): Promise<T> {
    const key = env('SUPABASE_SECRET_KEY');
    const r = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`DB 호출 실패 ${name} ${r.status}`);
    const t = await r.text();
    return (t ? JSON.parse(t) : null) as T;
}

/** 테이블에 한 행 넣기(PostgREST). 반환 본문은 받지 않는다. */
export async function insert(table: string, row: Record<string, unknown>): Promise<void> {
    const key = env('SUPABASE_SECRET_KEY');
    const r = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${table}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
            Prefer: 'return=minimal' },
        body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`DB 기록 실패 ${table} ${r.status}`);
}
