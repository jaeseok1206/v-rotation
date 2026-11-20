"""KOVO 남자부 등록 선수 명단을 받아 data/players.json 으로 저장.
사용법: python3 scripts/fetch_players.py
"""
import json, pathlib, urllib.request
from datetime import datetime, timezone

API = 'https://user-api.kovo.co.kr'
TEAMS = [
    {'code': '1001', 'name': '대한항공'},
    {'code': '1005', 'name': '현대캐피탈'},
    {'code': '1009', 'name': '우리카드'},
    {'code': '1004', 'name': 'KB손해보험'},
    {'code': '1006', 'name': '한국전력'},
    {'code': '1008', 'name': 'OK저축은행'},
    {'code': '1002', 'name': '삼성화재'},
]

out = {'updatedAt': datetime.now(timezone.utc).isoformat(), 'teams': []}
for t in TEAMS:
    req = urllib.request.Request(f"{API}/teams/{t['code']}/players",
                                 headers={'Accept-Language': 'ko', 'User-Agent': 'v-rotation'})
    with urllib.request.urlopen(req, timeout=15) as r:
        payload = json.load(r).get('payload') or []
    players = [
        {'id': p['playerCode'], 'name': p['name'], 'pos': p.get('position') or '', 'no': p.get('backNumber')}
        for p in payload
        if p.get('visible', True) and 'REGISTER' in (p.get('status') or [])
    ]
    players.sort(key=lambda p: p['no'] if p['no'] is not None else 999)
    out['teams'].append({**t, 'players': players})
    print(f"{t['name']}: {len(players)}명")

dest = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'players.json'
dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print('저장:', dest)
