// 서버 전용 환경값. 로컬은 .env(import.meta.env), Vercel 은 process.env 로 들어온다.
export function env(name: string): string {
    const v = process.env[name] ?? (import.meta.env as Record<string, string | undefined>)[name];
    if (!v) throw new Error(`환경값 ${name} 이(가) 없습니다`);
    return v;
}
