import * as S from './state.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SIDE_LABEL = { home: 'HOME', away: 'AWAY' };
const SIDE_COLOR = { home: 'var(--home)', away: 'var(--away)' };
const LIB_ROLE = { recv: '리시브', dig: '디그' };

// 코트 화면 배치 (lineup index: 0=1번 ... 5=6번)
// 위쪽 팀은 아래(네트)를 바라보므로 좌우가 뒤집힌다
const LAYOUT_TOP = [0, 5, 4, /* 후위: 1 6 5 */ 1, 2, 3 /* 전위: 2 3 4 */];
const LAYOUT_BOTTOM = [3, 2, 1, /* 전위: 4 3 2 */ 4, 5, 0 /* 후위: 5 6 1 */];

const ICON_CW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
const ICON_CCW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.34-5.66"/><path d="M4 4v5h5"/></svg>';

let DATA = null;          // players.json
let st = null;            // 경기 상태
let sel = null;           // {kind:'slot'|'bench'|'libero', side, idx?, id?}
let benchTab = 'home';
let wakeLock = null;

// ---------- 데이터 헬퍼 ----------
const team = code => DATA.teams.find(t => t.code === code);
const teamOf = side => team(st[side]);
const roster = side => [...(teamOf(side)?.players || []), ...(st.extra[side] || [])];
const player = (side, id) => roster(side).find(p => p.id === id);
const posOf = (side, id) => player(side, id)?.pos;

function commit() {
  S.save(st);
  render();
}

function buzz(ms = 15) { try { navigator.vibrate?.(ms); } catch { /* noop */ } }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1600);
}

// ---------- 렌더링 ----------
function render() {
  if (!st) return;
  renderScorebar();
  renderCourt();
  renderBench();
  renderActions();
}

function renderScorebar() {
  const side = s => {
    const t = teamOf(s);
    return `<div class="sb-team ${s === 'away' ? 'right' : ''}">
      <span class="sb-label">${SIDE_LABEL[s]}</span>
      <span class="sb-name"><span class="serve-dot ${st.serving === s && st.phase === 'play' ? '' : 'off'}"></span>${esc(t?.name)}</span>
      <span class="sb-sets">세트 <b>${st.setsWon[s]}</b></span>
    </div>`;
  };
  const hist = st.setScores.map(x => `${x.home}-${x.away}`).join(' · ');
  $('#scorebar').innerHTML = `
    ${side('home')}
    <div class="sb-center">
      <div class="sb-score">${st.score.home}<span class="sep">:</span>${st.score.away}</div>
      <div class="sb-setno">${st.phase === 'done' ? '경기 종료' : `${st.setNo}세트${st.phase === 'lineup' ? ' 준비' : ''}`}</div>
      ${hist ? `<div class="sb-history">${hist}</div>` : ''}
    </div>
    ${side('away')}`;
}

function circleHTML(side, idx, libIdx) {
  const id = st.lineup[side][idx];
  const isSel = sel?.kind === 'slot' && sel.side === side && sel.idx === idx;
  const server = st.phase === 'play' && st.serving === side && idx === 0;
  const cls = ['player'];
  if (isSel) cls.push('selected');
  // 벤치 선수를 먼저 골랐다면, 그 선수와 교체로 묶인 코트 선수 강조
  if (sel?.kind === 'bench' && sel.side === side && id && S.partnerOf(st, side, sel.id) === id) cls.push('partner');
  let inner;
  if (idx === libIdx) {
    const act = S.activeLibero(st, side);
    const lib = player(side, act.id);
    const mb = player(side, id);
    cls.push('libero');
    inner = `<span class="pos">L·${LIB_ROLE[act.role]}</span><span class="no">${esc(lib?.no)}</span><span class="nm">${esc(lib?.name)}</span><span class="sub-for">↔ ${esc(mb?.no)}</span>`;
  } else if (id) {
    const p = player(side, id);
    inner = `<span class="pos">${esc(p?.pos)}</span><span class="no">${esc(p?.no)}</span><span class="nm">${esc(p?.name)}</span>`;
  } else {
    cls.push('empty');
    inner = `<span class="no">${idx + 1}</span><span class="pos">자리</span>`;
  }
  const ball = server ? '<img class="serve-ball" src="icons/ball.png" alt="서브">' : '';
  return `<div class="slot"><div class="pwrap"><button class="${cls.join(' ')}" style="--c:${SIDE_COLOR[side]}" data-act="slot" data-side="${side}" data-idx="${idx}">${inner}</button>${ball}</div></div>`;
}

function renderCourt() {
  const top = st.flipped ? 'home' : 'away';
  const bottom = S.other(top);
  const half = (side, layout) => {
    const libIdx = S.liberoSlot(st, side, posOf);
    return layout.map(i => circleHTML(side, i, libIdx)).join('');
  };
  $('#half-top').innerHTML = half(top, LAYOUT_TOP);
  $('#half-bottom').innerHTML = half(bottom, LAYOUT_BOTTOM);
  $('#ctrl-top').innerHTML = ctrlHTML(top);
  $('#ctrl-bottom').innerHTML = ctrlHTML(bottom);
}

function ctrlHTML(side) {
  const libs = st.libero[side];
  const active = st.phase === 'play' ? S.activeLibero(st, side) : null;
  const chip = role => {
    const own = player(side, libs[role]);
    const otherRole = role === 'recv' ? 'dig' : 'recv';
    const fallback = !own && libs[otherRole];
    const isSel = sel?.kind === 'libero' && sel.side === side && sel.role === role;
    const on = active?.role === role;
    const body = own ? `${esc(own.no)} ${esc(own.name)}` : fallback ? `= ${LIB_ROLE[otherRole]}` : '지정';
    return `<button class="lib-chip ${isSel ? 'selected' : ''} ${on ? 'on' : ''}" data-act="libero" data-side="${side}" data-role="${role}">
      <span class="lb">${LIB_ROLE[role]} L</span><span class="lv">${body}</span></button>`;
  };
  return `
    <span class="tdot" style="background:${SIDE_COLOR[side]}" title="${SIDE_LABEL[side]}"></span>
    <button class="icon-btn" data-act="rot" data-side="${side}" data-dir="-1" aria-label="${SIDE_LABEL[side]} 역방향 한 칸">${ICON_CCW}</button>
    <button class="icon-btn" data-act="rot" data-side="${side}" data-dir="1" aria-label="${SIDE_LABEL[side]} 정방향 한 칸">${ICON_CW}</button>
    ${chip('recv')}${chip('dig')}`;
}

function renderBench() {
  const side = benchTab;
  $('#bench-tabs').innerHTML = S.SIDES.map(s =>
    `<button class="tab ${s === side ? 'active' : ''}" style="--tc:${SIDE_COLOR[s]}" data-act="tab" data-side="${s}">${esc(teamOf(s)?.name)}</button>`
  ).join('');

  const onCourt = new Set(st.lineup[side].filter(Boolean));
  let list = roster(side).filter(p => !onCourt.has(p.id));
  // 리베로 선택 중이면 L 포지션을 위로
  if (sel?.kind === 'libero' && sel.side === side) list = [...list].sort((a, b) => (b.pos === 'L') - (a.pos === 'L'));
  // 경기 중 코트 선수를 골랐다면: 교체 짝이 있으면 그 선수만 강조, 이미 다른 짝이 있는 벤치 선수는 흐리게
  const focusId = st.phase === 'play' && sel?.kind === 'slot' && sel.side === side ? st.lineup[side][sel.idx] : null;
  const partner = focusId ? S.partnerOf(st, side, focusId) : null;
  const item = p => {
    const isSel = sel?.kind === 'bench' && sel.side === side && sel.id === p.id;
    let mark = '';
    if (focusId) mark = p.id === partner ? 'partner' : (partner || S.partnerOf(st, side, p.id)) ? 'dim' : '';
    const libs = st.libero[side];
    const libTag = [libs.recv === p.id && '리시브L', libs.dig === p.id && '디그L'].filter(Boolean).join('·');
    return `<li><button class="bp ${isSel ? 'selected' : ''} ${mark}" data-act="bench" data-side="${side}" data-id="${esc(p.id)}">
      <span class="bno">${esc(p.no ?? '-')}</span>
      <span class="bnm">${esc(p.name)}</span>
      <span class="bpos">${esc(p.pos)}${libTag ? ` · ${libTag}` : ''}</span>
    </button></li>`;
  };
  let head = '';
  if (sel?.side === side && sel.kind === 'slot') {
    const pp = partner && player(side, partner);
    head = pp
      ? `<div class="bench-head">교체 가능: ${esc(pp.no)} ${esc(pp.name)} (이번 세트 교체 짝)</div>`
      : `<div class="bench-head">${sel.idx + 1}번 자리에 넣을 선수</div>`;
  }
  else if (sel?.side === side && sel.kind === 'libero') {
    const desc = sel.role === 'recv' ? '상대 서브 때' : '우리 서브 때';
    head = `<div class="bench-head">${LIB_ROLE[sel.role]} 리베로 (${desc})</div>
      <li><button class="add-btn" data-act="libero-clear" data-side="${side}" data-role="${sel.role}">비우기 (다른 리베로가 겸임)</button></li>`;
  }
  $('#bench-list').innerHTML = head + list.map(item).join('') +
    `<li><button class="add-btn" data-act="add-player" data-side="${side}">+ 명단에 없는 선수 추가</button></li>`;
}

function renderActions() {
  const el = $('#actions');
  if (st.phase === 'play') {
    el.innerHTML = `
      <div class="score-row">
        ${S.SIDES.map(s => `<button class="score-btn" style="--c:${SIDE_COLOR[s]}" data-act="score" data-side="${s}">
          ${SIDE_LABEL[s]} 득점<small>${esc(teamOf(s)?.name)}</small></button>`).join('')}
      </div>
      <div class="tool-row">
        <button class="tool-btn" data-act="undo" ${st.history.length ? '' : 'disabled'}>↶ 되돌리기</button>
        <button class="tool-btn" data-act="end-set">세트 종료</button>
        <button class="tool-btn" data-act="menu">메뉴</button>
      </div>`;
  } else if (st.phase === 'lineup') {
    const filled = S.SIDES.every(s => st.lineup[s].every(Boolean));
    el.innerHTML = `
      <div class="lineup-hint">자리를 탭한 뒤 오른쪽 명단에서 선수를 고르세요. 자리 두 곳을 차례로 탭하면 서로 바뀝니다.</div>
      <div class="serve-pick">첫 서브
        ${S.SIDES.map(s => `<button class="seg ${st.serving === s ? 'on' : ''}" style="--c:${SIDE_COLOR[s]}" data-act="serve" data-side="${s}">${esc(teamOf(s)?.name)}</button>`).join('')}
      </div>
      <div class="tool-row">
        <button class="tool-btn" data-act="undo" ${st.history.length ? '' : 'disabled'}>↶ 되돌리기</button>
        <button class="tool-btn" data-act="clear-lineup">라인업 비우기</button>
        <button class="tool-btn" data-act="menu">메뉴</button>
      </div>
      <button class="primary-btn" data-act="start-set" ${filled ? '' : 'disabled'}>${st.setNo}세트 시작${filled ? '' : ' (12자리 모두 입력)'}</button>`;
  } else {
    const w = st.setsWon.home > st.setsWon.away ? 'home' : 'away';
    el.innerHTML = `
      <div class="lineup-hint">경기 종료 · ${esc(teamOf(w)?.name)} 승리 (${st.setsWon.home}:${st.setsWon.away})</div>
      <div class="tool-row">
        <button class="tool-btn" data-act="undo" ${st.history.length ? '' : 'disabled'}>↶ 되돌리기</button>
        <button class="tool-btn" data-act="new-match">새 경기</button>
        <button class="tool-btn" data-act="menu">메뉴</button>
      </div>`;
  }
}

// ---------- 모달 ----------
function openModal(html, onClick) {
  $('#modal-card').innerHTML = html;
  $('#modal').classList.remove('hidden');
  $('#modal').onclick = e => {
    const b = e.target.closest('[data-m]');
    if (b) onClick(b.dataset.m, b);
  };
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').onclick = null; }

function setupModal(canCancel) {
  const opts = (selCode) => DATA.teams.map(t => `<option value="${t.code}" ${t.code === selCode ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const h = st?.home ?? DATA.teams[0].code;
  const a = st?.away ?? DATA.teams[1].code;
  openModal(`
    <h2>새 경기</h2>
    <label class="field">HOME 팀<select id="m-home">${opts(h)}</select></label>
    <label class="field">AWAY 팀<select id="m-away">${opts(a)}</select></label>
    <label class="field">시작 세트<select id="m-set">${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${n}세트</option>`).join('')}</select></label>
    <div id="m-mid" hidden>
      <label class="field">지금까지 세트 스코어 (HOME : AWAY)<select id="m-sets"></select></label>
      <div class="field">현재 세트 점수 (HOME : AWAY, 시작 전이면 0)
        <div class="score-in"><input id="m-sh" type="number" inputmode="numeric" min="0" max="60" value="0"><span>:</span><input id="m-sa" type="number" inputmode="numeric" min="0" max="60" value="0"></div>
      </div>
    </div>
    <label class="field"><span id="m-serve-l">첫 서브</span><select id="m-serve"><option value="home">HOME</option><option value="away">AWAY</option></select></label>
    <p>명단 기준: ${new Date(DATA.updatedAt).toLocaleDateString('ko-KR')} KOVO 등록 선수</p>
    <div class="btn-row">
      ${canCancel ? '<button class="btn" data-m="cancel">취소</button>' : '<span></span>'}
      <button class="btn primary" data-m="ok">시작</button>
    </div>`, (m) => {
    if (m === 'cancel') return closeModal();
    const home = $('#m-home').value, away = $('#m-away').value;
    if (home === away) return toast('서로 다른 팀을 고르세요');
    const setNo = Number($('#m-set').value);
    const [sh, sa] = setNo > 1 ? $('#m-sets').value.split(':').map(Number) : [0, 0];
    const pts = v => Math.max(0, Math.min(60, Number(v) || 0));
    const score = setNo > 1 ? { home: pts($('#m-sh').value), away: pts($('#m-sa').value) } : undefined;
    st = S.newMatch(home, away, $('#m-serve').value, { setNo, setsWon: { home: sh, away: sa }, score });
    sel = null; benchTab = 'home';
    closeModal(); commit();
  });
  $('#m-set').onchange = syncMidFields;
  syncMidFields();
}

// 시작 세트에 맞춰 가능한 세트 스코어 목록 갱신 (합 = 시작세트-1, 어느 팀도 3 미만)
function syncMidFields() {
  const n = Number($('#m-set').value);
  $('#m-mid').hidden = n === 1;
  $('#m-serve-l').textContent = n === 1 ? '1세트 첫 서브' : '지금 서브권';
  const opts = [];
  for (let h = Math.min(2, n - 1); h >= 0; h--) { const a = n - 1 - h; if (a <= 2) opts.push(`${h}:${a}`); }
  $('#m-sets').innerHTML = opts.map(o => `<option value="${o}">${o.replace(':', ' : ')}</option>`).join('');
}

function setEndModal(winner) {
  const sc = `${st.score.home} : ${st.score.away}`;
  if (winner) {
    openModal(`
      <h2>${st.setNo}세트 종료?</h2>
      <p>${esc(teamOf(winner)?.name)} 세트 획득 (${sc})</p>
      <div class="btn-row">
        <button class="btn" data-m="cancel">계속 진행</button>
        <button class="btn primary" data-m="ok">세트 종료</button>
      </div>`, m => {
      closeModal();
      if (m === 'ok') finishSet(winner);
    });
  } else {
    openModal(`
      <h2>${st.setNo}세트 종료</h2>
      <p>현재 ${sc} · 세트를 가져간 팀을 고르세요</p>
      <div class="btn-row">
        <button class="btn" data-m="home" style="color:var(--home)">${esc(teamOf('home')?.name)}</button>
        <button class="btn" data-m="away" style="color:var(--away)">${esc(teamOf('away')?.name)}</button>
      </div>
      <div class="btn-row"><button class="btn" data-m="cancel" style="grid-column:span 2">취소</button></div>`, m => {
      closeModal();
      if (m === 'home' || m === 'away') finishSet(m);
    });
  }
}

function finishSet(winner) {
  S.endSet(st, winner);
  sel = null;
  commit();
  if (st.phase === 'done') toast(`경기 종료 · ${teamOf(winner)?.name} 승리`);
  else toast(`${st.setNo}세트 라인업을 확인하세요`);
}

function menuModal() {
  openModal(`
    <h2>메뉴</h2>
    <div class="menu-list">
      <button class="btn" data-m="flip">↕ 코트 위/아래 팀 바꾸기</button>
      <button class="btn" data-m="new">새 경기 시작</button>
      <button class="btn" data-m="close">닫기</button>
    </div>
    <p>명단 기준일: ${new Date(DATA.updatedAt).toLocaleString('ko-KR')}<br>
    명단 갱신: <code>python3 scripts/fetch_players.py</code> 실행 후 다시 배포</p>`, m => {
    if (m === 'flip') { st.flipped = !st.flipped; closeModal(); commit(); }
    else if (m === 'new') {
      openModal(`<h2>새 경기를 시작할까요?</h2><p>현재 경기 기록은 지워집니다.</p>
        <div class="btn-row"><button class="btn" data-m="no">취소</button><button class="btn danger" data-m="yes">새 경기</button></div>`,
      mm => { if (mm === 'yes') setupModal(true); else closeModal(); });
    } else closeModal();
  });
}

function addPlayerModal(side) {
  openModal(`
    <h2>${esc(teamOf(side)?.name)} 선수 추가</h2>
    <label class="field">등번호<input id="m-no" type="number" inputmode="numeric" min="0" max="99"></label>
    <label class="field">이름<input id="m-name" type="text" maxlength="12"></label>
    <label class="field">포지션<select id="m-pos">
      <option>OH</option><option>OP</option><option>MB</option><option>S</option><option>L</option></select></label>
    <div class="btn-row"><button class="btn" data-m="cancel">취소</button><button class="btn primary" data-m="ok">추가</button></div>`, m => {
    if (m !== 'ok') return closeModal();
    const no = $('#m-no').value.trim(), name = $('#m-name').value.trim();
    if (!no && !name) return toast('등번호나 이름을 입력하세요');
    S.pushHistory(st);
    st.extra[side].push({ id: `x${Date.now()}`, no: no === '' ? null : Number(no), name: name || `#${no}`, pos: $('#m-pos').value });
    closeModal(); commit();
  });
}

// ---------- 이벤트 ----------
function onSlot(side, idx) {
  if (sel?.kind === 'bench' && sel.side === side) return onSlotPick(side, idx, sel.id);
  if (sel?.kind === 'slot' && sel.side === side && sel.idx !== idx) {
    S.swapSlots(st, side, sel.idx, idx);
    sel = null; buzz(); return commit();
  }
  if (sel?.kind === 'slot' && sel.side === side && sel.idx === idx) sel = null;
  else { sel = { kind: 'slot', side, idx }; benchTab = side; }
  render();
}

function onBench(side, id) {
  if (sel?.kind === 'slot' && sel.side === side) return onSlotPick(side, sel.idx, id);
  if (sel?.kind === 'libero' && sel.side === side) {
    S.setLibero(st, side, sel.role, id); sel = null; buzz(); return commit();
  }
  sel = (sel?.kind === 'bench' && sel.id === id) ? null : { kind: 'bench', side, id };
  render();
}

function onSlotPick(side, idx, id) {
  const out = player(side, st.lineup[side][idx]);
  const p = player(side, id);
  S.placePlayer(st, side, idx, id);
  if (st.phase === 'play' && out) toast(`교체: ${out.no} ${out.name} → ${p.no} ${p.name}`);
  // 라인업 입력 중이면 다음 빈 자리로 자동 이동
  const next = st.phase === 'lineup' ? st.lineup[side].findIndex(x => !x) : -1;
  sel = next >= 0 ? { kind: 'slot', side, idx: next } : null;
  buzz(); commit();
}

function onScore(side) {
  const sideOut = st.serving !== side;
  S.score(st, side);
  buzz(sideOut ? [20, 40, 20] : 20);
  sel = null;
  commit();
  if (sideOut) toast(`${teamOf(side)?.name} 사이드아웃 → 로테이션`);
  const w = S.setWinner(st);
  if (w) setEndModal(w);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || !st) return;
  const { act, side } = b.dataset;
  switch (act) {
    case 'slot': return onSlot(side, Number(b.dataset.idx));
    case 'bench': return onBench(side, b.dataset.id);
    case 'tab': benchTab = side; return render();
    case 'rot': S.rotate(st, side, Number(b.dataset.dir)); buzz(); return commit();
    case 'libero': {
      const role = b.dataset.role;
      sel = (sel?.kind === 'libero' && sel.side === side && sel.role === role) ? null : { kind: 'libero', side, role };
      benchTab = side; return render();
    }
    case 'libero-clear': S.setLibero(st, side, b.dataset.role, null); sel = null; return commit();
    case 'score': return onScore(side);
    case 'undo': st = S.undo(st); sel = null; buzz(); toast('되돌림'); return commit();
    case 'end-set': return setEndModal(S.setWinner(st));
    case 'serve': st.serving = side; return commit();
    case 'clear-lineup':
      S.pushHistory(st);
      st.lineup = { home: Array(6).fill(null), away: Array(6).fill(null) };
      sel = { kind: 'slot', side: benchTab, idx: 0 };
      return commit();
    case 'start-set': S.startSet(st); sel = null; toast(`${st.setNo}세트 시작`); return commit();
    case 'menu': return menuModal();
    case 'new-match': return setupModal(true);
    case 'add-player': return addPlayerModal(side);
  }
});

// ---------- 화면 꺼짐 방지 ----------
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* 지원 안 함 */ }
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('click', keepAwake, { once: true });

// ---------- 시작 ----------
async function init() {
  DATA = await fetch('data/players.json').then(r => r.json());
  st = S.load();
  if (st && (!team(st.home) || !team(st.away))) st = null;
  if (st) render();
  else {
    st = S.newMatch(DATA.teams[0].code, DATA.teams[1].code);
    render();
    setupModal(false);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
