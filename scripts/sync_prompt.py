#!/usr/bin/env python3
"""radsafety-laws/scripts/_prompt.py → src/lib/prompt.ts.

프롬프트의 정본은 radsafety-laws 다(평가가 그 문자열로 채점된다). 여기서 손으로 고치지 말고
정본을 고친 뒤 `npm run sync-prompt` 로 옮긴다.
"""
import json, os, sys
SRC = os.path.expanduser(os.environ.get('LAWS_REPO', '~/projects/radsafety-laws')) + '/scripts'
sys.path.insert(0, SRC)
import _prompt  # noqa: E402
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'lib', 'prompt.ts')
with open(out, 'w', encoding='utf-8') as f:
    f.write('// ⚠️ 자동 생성 — 직접 고치지 말 것. 정본: radsafety-laws/scripts/_prompt.py (npm run sync-prompt)\n')
    f.write(f'export const SYS = {json.dumps(_prompt.SYS, ensure_ascii=False)};\n')
    f.write(f'export const SYS_UPCOMING = {json.dumps(_prompt.SYS_UPCOMING, ensure_ascii=False)};\n')
print('wrote', os.path.relpath(out))
