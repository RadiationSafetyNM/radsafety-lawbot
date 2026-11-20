#!/usr/bin/env python3
"""radsafety-laws/data/amendment-tracker.yaml → src/lib/tracker.json (열린 항목만).

대장의 정본은 radsafety-laws 다. 여기서 손으로 고치지 말고 정본을 고친 뒤
`npm run sync-tracker` 로 옮긴다. (관리 화면이 생기면 DB 로 옮길 자리.)
"""
import json, os
import yaml
SRC = os.path.expanduser(os.environ.get('LAWS_REPO', '~/projects/radsafety-laws')) + '/data/amendment-tracker.yaml'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'lib', 'tracker.json')
items = [it for it in (yaml.safe_load(open(SRC, encoding='utf-8')) or {}).get('items', []) if not it.get('closed')]
for it in items:                       # YAML 날짜 → 문자열
    it['expected_effective'] = str(it.get('expected_effective') or '')
    for t in it.get('timeline', []):
        t['date'] = str(t['date'])
json.dump(items, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'wrote {os.path.relpath(OUT)} ({len(items)}건)')
