"""KOVO 남자부 등록 선수 명단 + 팀별 최근 경기 1세트 선발 라인업을 받아 data/players.json 으로 저장.
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

def get(path):
    req = urllib.request.Request(API + path, headers={'Accept-Language': 'ko', 'User-Agent': 'v-rotation'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r).get('payload')


def match_name(name, players):
    """중계 기록의 선수 이름 → 명단 선수 id. 정확히 일치 우선, 없으면 유일한 부분 일치."""
    if not name:
        return None
    exact = [p for p in players if p['name'] == name]
    if len(exact) == 1:
        return exact[0]['id']
    part = [p for p in players if name in p['name'] or p['name'] in name]
    return part[0]['id'] if len(part) == 1 else None


def recent_lineup(code, players):
    """팀의 가장 최근 종료 경기 1세트 선발 라인업 (1~6번 자리 순서 + 리베로)."""
    games = get(f'/mains/games/schedules/ended?gender=MALE&tcode={code}') or []
    for g in games:  # 최신순
        home = g['homeTeam']['value'] == code
        q = (f"/stat/real-time?season={g['season']['value']}&round={g['round']}&gnum={g['number']}"
             f"&gcode={g['match']}&hcode={g['homeTeam']['value']}&acode={g['awayTeam']['value']}&rset=1&page=0&size=1")
        lu = (get(q) or {}).get('lineup')
        if not lu:
            continue
        k = 'hp' if home else 'ap'
        names = [lu.get(f'{k}{i}') or '' for i in range(1, 9)]
        missing = [n for n in names if n and not match_name(n, players)]
        if missing:
            print(f"  ! 명단에서 못 찾은 이름: {missing}")
        return {
            'positions': [match_name(n, players) for n in names[:6]],
            'liberos': [x for x in (match_name(n, players) for n in names[6:]) if x],
            'game': {'date': g['gameDate'],
                     'opponent': g['awayTeam' if home else 'homeTeam']['name'],
                     'home': home},
        }
    return None


out = {'updatedAt': datetime.now(timezone.utc).isoformat(), 'teams': []}
for t in TEAMS:
    payload = get(f"/teams/{t['code']}/players") or []
    players = [
        {'id': p['playerCode'], 'name': p['name'], 'pos': p.get('position') or '', 'no': p.get('backNumber')}
        for p in payload
        if p.get('visible', True) and 'REGISTER' in (p.get('status') or [])
    ]
    players.sort(key=lambda p: p['no'] if p['no'] is not None else 999)
    lineup = recent_lineup(t['code'], players)
    out['teams'].append({**t, 'players': players, 'defaultLineup': lineup})
    names = {p['id']: p['name'] for p in players}
    desc = (f"{lineup['game']['date']} vs {lineup['game']['opponent']} → "
            + ', '.join(names.get(i, '?') for i in lineup['positions'])
            + ' / L ' + ', '.join(names[i] for i in lineup['liberos'])) if lineup else '최근 라인업 없음'
    print(f"{t['name']}: {len(players)}명 | {desc}")

dest = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'players.json'
try:
    prev = json.loads(dest.read_text(encoding='utf-8'))
except (OSError, ValueError):
    prev = None
if prev and prev.get('teams') == out['teams']:
    print('변경 없음:', dest)  # updatedAt만 바뀌는 불필요한 커밋 방지
else:
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print('저장:', dest)
