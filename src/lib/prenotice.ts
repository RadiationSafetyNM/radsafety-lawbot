// 공포 전 개정 — 국민참여입법센터 입법예고·행정예고.
// 정본은 radsafety-laws/data/prenotice.json (일일 수집 서버가 갱신·푸시). 공개 저장소라 raw 주소로 읽는다 —
// DB 표·비밀값이 필요 없고, 수집이 멈추거나 GitHub 이 안 되면 이 절만 빠진다(화면의 나머지는 그대로).
// ⚠️ 확정이 아니다. 답변 근거로 쓰지 않는다(개정 예정 화면 표시 전용).
const SRC = 'https://raw.githubusercontent.com/RadiationSafetyNM/radsafety-laws/main/data/prenotice.json';
const TTL = 60 * 60 * 1000;      // 1시간 — 원천은 하루 한 번 바뀐다
const RECENT_DAYS = 180;         // 예고가 끝난 지 오래된 것은 이미 공포됐거나 접힌 것

export type Notice = {
    id: string; kind: '입법예고' | '행정예고'; title: string; agency: string; class: string;
    notice_no: string; notice_date: string; start: string; end: string; open: boolean;
    stage: string; stage_date: string; topic: 'ri-medical' | 'other'; link: string;
    dept: string; summary: string; files: { name: string; url: string }[]; matched: string;
};

let cache: { at: number; items: Notice[] } | null = null;

export async function prenotice(today: string): Promise<{ main: Notice[]; other: Notice[] }> {
    if (!cache || Date.now() - cache.at > TTL) {
        try {
            const r = await fetch(SRC, { signal: AbortSignal.timeout(4000) });
            if (r.ok) cache = { at: Date.now(), items: (await r.json()).items ?? [] };
        } catch (e) {
            console.error('[lawbot] 예고 목록을 읽지 못함', e);
        }
    }
    const since = new Date(Date.parse(today) - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
    const items = (cache?.items ?? [])
        .filter((n) => n.stage !== '공포' && (n.end || n.notice_date) >= since)
        .map((n) => ({ ...n, open: !!n.start && !!n.end && n.start <= today && today <= n.end }))   // 기준일로 다시 계산
        .sort((a, b) => Number(b.open) - Number(a.open) || b.notice_date.localeCompare(a.notice_date));
    return { main: items.filter((n) => n.topic === 'ri-medical'), other: items.filter((n) => n.topic !== 'ri-medical') };
}
