#!/usr/bin/env python3
"""radsafety-laws/data/query-terms.yaml → src/lib/terms.json.

사전의 정본은 radsafety-laws 다. 여기서 손으로 고치지 말고 정본을 고친 뒤
`npm run sync-terms` 로 옮긴다.
"""
import json, os
import yaml
SRC = os.path.expanduser(os.environ.get('LAWS_REPO', '~/projects/radsafety-laws')) + '/data/query-terms.yaml'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'lib', 'terms.json')
terms = [{'term': t['term'], 'legal': t['legal']}
         for t in (yaml.safe_load(open(SRC, encoding='utf-8')) or {}).get('terms', [])]
json.dump(terms, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'wrote {os.path.relpath(OUT)} ({len(terms)}건)')
