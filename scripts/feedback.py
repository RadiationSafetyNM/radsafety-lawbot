#!/usr/bin/env python3
"""'이상한 답변' 신고 목록 보기 — lawbot_feedback 최근 N건(기본 상태 new).

사용: python3 scripts/feedback.py [--all] [--limit 20]
      python3 scripts/feedback.py --done 3 5     # 처리한 신고를 done 으로
.env 의 SUPABASE_URL·SUPABASE_SECRET_KEY 를 쓴다.
"""
import argparse, json, os, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
for line in open(os.path.join(ROOT, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip())
URL, KEY = os.environ['SUPABASE_URL'].rstrip('/'), os.environ['SUPABASE_SECRET_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}


def req(method, path, body=None):
    r = urllib.request.Request(f'{URL}/rest/v1/{path}', method=method, headers=H,
                               data=json.dumps(body).encode() if body is not None else None)
    t = urllib.request.urlopen(r, timeout=30).read()
    return json.loads(t) if t else None


ap = argparse.ArgumentParser()
ap.add_argument('--all', action='store_true')
ap.add_argument('--limit', type=int, default=20)
ap.add_argument('--done', nargs='*', type=int)
a = ap.parse_args()
if a.done:
    req('PATCH', 'lawbot_feedback?id=in.(' + ','.join(map(str, a.done)) + ')', {'status': 'done'})
    print(f'done 처리: {a.done}')
else:
    q = {'select': '*', 'order': 'at.desc', 'limit': a.limit}
    if not a.all:
        q['status'] = 'eq.new'
    rows = req('GET', 'lawbot_feedback?' + urllib.parse.urlencode(q))
    for r in rows:
        print(f"#{r['id']} {r['at'][:16]} [{r['status']}] 기준일 {r['as_of']}")
        print(f"  Q: {r['question']}")
        if r['note']:
            print(f"  메모: {r['note']}")
        print(f"  A: {r['answer'][:200].replace(chr(10), ' ')}")
        print('  근거: ' + ' | '.join(s['title'] for s in r['sources'][:5]))
    print(f'— {len(rows)}건')
