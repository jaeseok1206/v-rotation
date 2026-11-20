// 경기 상태 모델 + 순수 로직
// lineup[side] 는 길이 6 배열: index 0 = 1번 자리(후위 오른쪽, 서브), 1 = 2번, ... 5 = 6번
export const SIDES = ['home', 'away'];
export const other = s => (s === 'home' ? 'away' : 'home');

const STORE_KEY = 'v-rotation:state:v1';
const HISTORY_MAX = 300;

export function newMatch(homeCode, awayCode, firstServe = 'home') {
  return {
    phase: 'lineup',               // 'lineup' | 'play' | 'done'
    home: homeCode,
    away: awayCode,
    extra: { home: [], away: [] }, // 명단에 없는 임시 선수
    setNo: 1,
    setsWon: { home: 0, away: 0 },
    setScores: [],                 // [{home, away}]
    score: { home: 0, away: 0 },
    serving: firstServe,
    setFirstServe: firstServe,
    lineup: { home: Array(6).fill(null), away: Array(6).fill(null) },
    starters: { home: Array(6).fill(null), away: Array(6).fill(null) },
    libero: { home: null, away: null },
    flipped: false,                // true 면 HOME 이 코트 위쪽
    history: [],
  };
}

// ---------- 저장 ----------
export function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function save(st) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch { /* 저장 불가 환경 */ }
}
export function clearSaved() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ }
}

// ---------- 되돌리기 ----------
function snapshot(st) {
  const { history, ...rest } = st;
  return JSON.stringify(rest);
}
// 상태 변경 전에 호출
export function pushHistory(st) {
  st.history.push(snapshot(st));
  if (st.history.length > HISTORY_MAX) st.history.shift();
}
export function undo(st) {
  const prev = st.history.pop();
  if (!prev) return st;
  return { ...JSON.parse(prev), history: st.history };
}

// ---------- 로테이션 ----------
// 시계방향(정방향): 2→1, 3→2, ... 1→6
export const rotateForward = arr => arr.map((_, i) => arr[(i + 1) % 6]);
export const rotateBackward = arr => arr.map((_, i) => arr[(i + 5) % 6]);

export function rotate(st, side, dir = 1) {
  pushHistory(st);
  st.lineup[side] = dir > 0 ? rotateForward(st.lineup[side]) : rotateBackward(st.lineup[side]);
}

// ---------- 득점 ----------
export function score(st, side) {
  pushHistory(st);
  st.score[side] += 1;
  if (st.serving !== side) {           // 사이드아웃 → 회전 후 서브권 획득
    st.lineup[side] = rotateForward(st.lineup[side]);
    st.serving = side;
  }
}

export function targetPoints(setNo) { return setNo >= 5 ? 15 : 25; }

// 현재 점수로 세트가 끝났다면 승리 팀 반환
export function setWinner(st) {
  const t = targetPoints(st.setNo);
  const { home, away } = st.score;
  if (home >= t && home - away >= 2) return 'home';
  if (away >= t && away - home >= 2) return 'away';
  return null;
}

export function endSet(st, winner) {
  pushHistory(st);
  st.setScores.push({ ...st.score });
  st.setsWon[winner] += 1;
  if (st.setsWon[winner] >= 3) { st.phase = 'done'; return; }
  st.setNo += 1;
  st.score = { home: 0, away: 0 };
  // 다음 세트 기본값: 이전 세트 선발 라인업, 서브는 교대(5세트는 사용자가 지정)
  st.lineup = { home: [...st.starters.home], away: [...st.starters.away] };
  st.setFirstServe = other(st.setFirstServe);
  st.serving = st.setFirstServe;
  st.phase = 'lineup';
}

export function startSet(st) {
  pushHistory(st);
  st.starters = { home: [...st.lineup.home], away: [...st.lineup.away] };
  st.setFirstServe = st.serving;
  st.phase = 'play';
}

// ---------- 배치/교체 ----------
// 코트 자리(idx)에 선수 배치. 같은 팀 다른 자리에 있으면 자리 교환.
export function placePlayer(st, side, idx, playerId) {
  pushHistory(st);
  const lu = st.lineup[side];
  const from = lu.indexOf(playerId);
  if (from >= 0) lu[from] = lu[idx];
  lu[idx] = playerId;
  if (st.libero[side] === playerId) st.libero[side] = null;
}

export function swapSlots(st, side, a, b) {
  pushHistory(st);
  const lu = st.lineup[side];
  [lu[a], lu[b]] = [lu[b], lu[a]];
}

export function setLibero(st, side, playerId) {
  pushHistory(st);
  st.libero[side] = playerId;
  const idx = st.lineup[side].indexOf(playerId);
  if (idx >= 0) st.lineup[side][idx] = null;
}

// 리베로 표시: 후위(5,6번 및 서브권 없을 때 1번)의 MB 자리에 리베로를 덮어 보여줌
export function liberoSlot(st, side, posOf) {
  const lib = st.libero[side];
  if (!lib || st.phase !== 'play') return -1;
  const back = st.serving === side ? [4, 5] : [0, 4, 5]; // index 0=1번, 4=5번, 5=6번
  for (const i of back) {
    const id = st.lineup[side][i];
    if (id && posOf(side, id) === 'MB') return i;
  }
  return -1;
}
