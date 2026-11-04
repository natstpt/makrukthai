/* The puzzle page (https://natstpt.github.io/makrukthai/puzzle): sets of 10 mate-in-1/2/3 puzzles from
 * puzzle/sets.js and puzzle/sets/<id>.json (scripts/build-mate-puzzles.cjs; only the files of the sets a round uses are
 * fetched), laid out like a phone puzzle app: the guide says whose move
 * it is and what to find, the board, a clock and progress, and the tools along the bottom.
 * The settings (the gear, for teachers) pick the mate counts and piece sets; they are not remembered. */
(function () {
  'use strict';
  var R = window.MakrukRules, N = window.MakrukNotation, E = window.MakrukEditor, C = window.MakrukPuzzleCore;
  var DATA = window.MakrukPuzzleSets;
  var FILE = { king: 'K', rook: 'R', knight: 'N', met: 'Q', khon: 'B', pawn: 'P', promoted: 'F' };
  var THAI_FILES = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ญ'];
  var REPLY_DELAY = 550;
  var $ = function (id) { return document.getElementById(id); };
  var same = function (a, b) { return !!a && !!b && a.r === b.r && a.c === b.c; };
  var prefix = function (side) { return typeof MakrukPieceColors === 'object' ? MakrukPieceColors.prefix(side) : side === 'white' ? 'w' : 'r'; };
  var src = function (piece, side) { return 'assets/pieces/makruk/ada/' + prefix(side) + FILE[piece] + '.svg'; };

  // By default every set but those where the defender has two pieces.
  var filters = { mates: [1, 2, 3], sets: DATA.sets.filter(function (s) { return s.on; }).map(function (s) { return s.id; }) };
  var session = null, cur = null, timer = null, busy = 0, files = {}, round = 0;
  // Music and sound effects, shared with the AI and lesson pages (presentation.js; on or off is remembered there).
  var sound = window.MakrukPresentation ? window.MakrukPresentation.create({ board: $('board'), wrap: $('boardWrap') }) : null;
  // A move's sound, with the check chime when it gives check (not for the mating move, which gets the success sound).
  function moveSound(m, after, side, chime) {
    if (!sound) return;
    sound.queueMove({ from: m.from, to: m.to, check: chime !== false && R.inCheck(after, C.other(side)), skipAnimation: true });
    sound.flush();
  }
  function resultSound(kind) { if (sound) sound.playResult(kind); }

  // ---- A set of 10 ----
  // The puzzles of a piece set (fetched once).
  function load(id) {
    if (!files[id]) files[id] = fetch('puzzle/sets/' + id + '.json?v=20261105-local').then(function (res) {
      if (!res.ok) throw Error(res.status);
      return res.json();
    }).catch(function (e) { delete files[id]; throw e; });
    return files[id];
  }
  function newSession() {
    var slots = C.plan(DATA, filters), mine = ++round;
    clearInterval(timer); cur = null;
    if (!slots.length) { session = null; renderEmpty(); return; }
    say('กำลังเตรียมโจทย์…', ''); $('bar').innerHTML = '';
    var ids = slots.map(function (x) { return x.set; }).filter(function (id, i, a) { return a.indexOf(id) === i; });
    Promise.all(ids.map(load)).then(function (lists) {
      if (mine !== round) return;
      var got = {};
      ids.forEach(function (id, i) { got[id] = lists[i]; });
      session = { list: C.fill(slots, got), index: 0, results: [], times: [] };
      startPuzzle();
    }, function () {
      if (mine !== round) return;
      say('โหลดโจทย์ไม่สำเร็จ', 'ตรวจอินเทอร์เน็ตแล้วโหลดหน้านี้ใหม่อีกครั้ง');
    });
  }
  function startPuzzle() {
    var p = session.list[session.index], st = E.parse(p.fen);
    cur = {
      p: p, side: st.turn, start: st.pieces, pieces: st.pieces, node: p.tree, left: p.mate,
      history: [{ pieces: st.pieces, last: null, node: p.tree, left: p.mate }], view: 0,
      phase: 'play', hint: 0, hinted: false, failed: false, selected: null, wrong: null, reply: null, mated: false,
      began: Date.now(), elapsed: 0, result: null, lines: []
    };
    say(turnLine(), goalText());
    tick(); clearInterval(timer); timer = setInterval(tick, 1000);
    render();
  }
  function turnLine() { return '<span class="turnBox ' + cur.side + '"></span>' + C.sideName(cur.side) + 'เดิน'; }
  function goalText() {
    return cur.p.mate === 1 ? 'หาตารุกจนใน 1 ตา' : 'รุกจนให้ได้ใน ' + cur.p.mate + ' ตา ฝ่าย' + C.sideName(C.other(cur.side)) + 'จะหนีให้ดีที่สุด';
  }
  function say(title, text, dim) {
    $('say1').innerHTML = title; $('say2').textContent = text || '';
    $('speech').classList.toggle('dim', !!dim);
  }
  var MARK = {
    ok: '<svg class="mark" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#5fae4b"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bad: '<svg class="mark" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#e0635f"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg>',
    hint: '<svg class="mark" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" fill="#f2c14e" stroke="#a47b15" stroke-width="1.4"/><path d="M10 20h4" stroke="#a47b15" stroke-width="2" stroke-linecap="round"/></svg>'
  };
  function tick() {
    if (!cur) return;
    if (!cur.result) cur.elapsed = Date.now() - cur.began;
    var s = Math.floor(cur.elapsed / 1000);
    $('clock').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  // The first try decides the result: right with no hint (ok), right with a hint (hint) or not right (miss).
  function settle(result) {
    if (cur.result) return;
    cur.result = result; cur.elapsed = Date.now() - cur.began;
    session.results[session.index] = result; session.times[session.index] = cur.elapsed;
    tick();
  }

  // ---- Moves ----
  function live() { return cur && cur.phase === 'play' && cur.view === cur.history.length - 1 && !busy; }
  function play(from, to) {
    if (!live()) return;
    if (!R.legalDestinations(cur.pieces, from).some(function (t) { return same(t, to); })) return;
    var move = { from: from, to: to }, before = cur.pieces, text = N.formatMove(before, from, to);
    var res = C.step(cur.node, move), after = R.applyMove(before, from, to);
    cur.selected = null; cur.wrong = null; cur.reply = null;
    if (text) cur.lines.push(text.text);
    if (!res.ok) { wrongMove(before, after, move); return; }
    moveSound(move, after, cur.side, !res.mate);
    push(after, move);
    cur.left--; cur.hint = 0;
    if (res.mate) { solved(); return; }
    say(MARK.ok + 'ถูกต้อง!', 'เหลืออีก ' + cur.left + ' ตา รอดูฝ่าย' + C.sideName(C.other(cur.side)) + 'เดินก่อนนะ');
    cur.node = res.node; render();
    busy++;
    setTimeout(function () {
      busy--;
      var t = N.formatMove(cur.pieces, res.reply.from, res.reply.to);
      if (t) cur.lines.push(t.text);
      push(R.applyMove(cur.pieces, res.reply.from, res.reply.to), res.reply);
      moveSound(res.reply, cur.pieces, C.other(cur.side));
      cur.history[cur.history.length - 1].node = cur.node;
      cur.history[cur.history.length - 1].left = cur.left;
      say(turnLine(), 'เหลืออีก ' + cur.left + ' ตา ' + (cur.left === 1 ? 'ตานี้ต้องจนเลย' : 'เดินต่อเลย'));
      render();
    }, REPLY_DELAY);
  }
  function push(pieces, last) {
    cur.pieces = pieces;
    cur.history.push({ pieces: pieces, last: last, node: cur.node, left: cur.left });
    cur.view = cur.history.length - 1;
  }
  function solved() {
    cur.phase = 'solved'; cur.mated = true;
    settle(cur.failed ? 'miss' : cur.hinted ? 'hint' : 'ok');
    var title = cur.failed ? 'แก้ได้แล้ว' : cur.hinted ? 'แก้ได้ด้วยคำใบ้' : 'แก้ได้แล้ว! เก่งมาก';
    var more = cur.failed ? 'ครั้งหน้าลองให้ได้ตั้งแต่ครั้งแรกนะ' : cur.hinted ? 'ลองจำรูปแบบนี้ไว้นะ' : 'รุกจนสวยมาก';
    say(MARK.ok + title, more + ' · ' + cur.lines.join(' · '));
    resultSound('success');
    render();
  }
  function wrongMove(before, after, move) {
    cur.failed = true; settle('miss');
    var why = C.refute(after, cur.side, cur.left);
    cur.phase = 'wrong'; cur.wrong = { before: before, move: move, after: after };
    cur.pieces = after; render();
    say(MARK.bad + 'ยังไม่ใช่', why.text);
    resultSound('failure');
    if (!why.reply) return;
    busy++;
    setTimeout(function () {
      busy--;
      if (!cur || cur.phase !== 'wrong') return;
      cur.reply = why.reply;
      cur.pieces = R.applyMove(after, why.reply.from, why.reply.to);
      moveSound(why.reply, cur.pieces, C.other(cur.side));
      render();
    }, REPLY_DELAY);
  }
  function retry() {
    if (!cur.wrong) return;
    cur.pieces = cur.wrong.before; cur.wrong = null; cur.reply = null; cur.phase = 'play';
    cur.lines.pop();
    say(turnLine(), 'ลองใหม่อีกครั้ง เหลืออีก ' + cur.left + ' ตา');
    render();
  }
  // Plays the book line from where the learner is (before a wrong move).
  function showSolution() {
    if (cur.wrong) { cur.pieces = cur.wrong.before; cur.wrong = null; cur.reply = null; cur.lines.pop(); }
    settle('miss');
    cur.phase = 'show'; cur.hint = 0;
    var steps = C.line(cur.node);
    say(MARK.hint + 'เฉลย', 'ดูให้ดีนะ');
    render();
    var i = 0;
    busy++;
    (function next() {
      if (!cur || cur.phase !== 'show') { busy--; return; }
      if (i >= steps.length) {
        busy--; cur.phase = 'solved'; cur.mated = true;
        say(MARK.hint + 'นี่คือเฉลย', cur.lines.join(' · '));
        render(); return;
      }
      var m = steps[i++], t = N.formatMove(cur.pieces, m.from, m.to), mover = i % 2 ? cur.side : C.other(cur.side);
      if (t) cur.lines.push(t.text);
      push(R.applyMove(cur.pieces, m.from, m.to), m);
      moveSound(m, cur.pieces, mover);
      render();
      setTimeout(next, REPLY_DELAY + 250);
    })();
  }
  function hint() {
    if (!live()) return;
    cur.hint = Math.min(2, cur.hint + 1); cur.hinted = true;
    say(MARK.hint + 'คำใบ้', cur.hint === 1 ? 'ลองเดินหมากที่มีกรอบสีเหลือง' : 'เดินตามลูกศรเลย');
    render();
  }
  function restart() {
    var keep = { result: cur.result, elapsed: cur.elapsed };
    startPuzzle();
    cur.result = keep.result; cur.elapsed = keep.elapsed; cur.failed = keep.result === 'miss'; cur.hinted = keep.result === 'hint';
    tick();
  }
  function nextPuzzle() {
    if (!cur.result) settle('miss');
    if (session.index + 1 >= session.list.length) { finish(); return; }
    session.index++; startPuzzle();
  }
  function view(delta) {
    var v = cur.view + delta;
    if (v < 0 || v >= cur.history.length || busy) return;
    cur.view = v; cur.selected = null; render();
  }
  function analyse() {
    var fen = E.fen({ pieces: cur.start, turn: cur.side });
    location.href = 'editor.html?analysis=1#fen=' + encodeURIComponent(fen) + (cur.side === 'black' ? '&flip=1' : '');
  }

  // ---- Board ----
  var flip = function () { return cur && cur.side === 'black'; };
  function shown() {
    if (cur.phase === 'wrong' || cur.view === cur.history.length - 1) return { pieces: cur.pieces, last: cur.phase === 'wrong' ? cur.reply || cur.wrong.move : cur.history[cur.view].last };
    return cur.history[cur.view];
  }
  function hintMove() { var k = cur.hint && Object.keys(cur.node)[0]; return k ? C.fromKey(k) : null; }
  function render() {
    renderBoard(); renderBar(); renderStats();
  }
  function renderBoard() {
    var board = $('board'), s = shown(), pieces = s.pieces, f = flip();
    var dests = live() && cur.selected ? R.legalDestinations(pieces, cur.selected) : [];
    var h = live() ? hintMove() : null;
    board.innerHTML = '';
    for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) {
      var at = { r: f ? 7 - i : i, c: f ? 7 - j : j }, el = document.createElement('button');
      el.type = 'button'; el.className = 'sq' + (j === 7 ? ' c7' : '') + (i === 7 ? ' r7' : '');
      el.dataset.r = at.r; el.dataset.c = at.c;
      var pc = pieces.find(function (p) { return same(p.at, at); }), html = '';
      if (j === 0) html += '<span class="coord rank">' + (8 - at.r) + '</span>';
      if (i === 7) html += '<span class="coord file">' + THAI_FILES[at.c] + '</span>';
      if (s.last && (same(s.last.from, at) || same(s.last.to, at))) el.classList.add('last');
      if (cur.selected && same(cur.selected, at)) el.classList.add('sel');
      if (live() && pc && pc.side === cur.side) el.classList.add('mine');
      if (dests.some(function (d) { return same(d, at); })) { el.classList.add('dest'); if (pc) el.classList.add('cap'); }
      if (h && same(h.from, at)) el.classList.add('hint');
      if (cur.phase === 'wrong' && same(cur.wrong.move.to, at) && !cur.reply) el.classList.add('wrongTo');
      if (pc) html += '<div class="piece"><img src="' + src(pc.piece, pc.side) + '" alt="" draggable="false"></div>';
      if (pc && pc.piece === 'king' && R.inCheck(pieces, pc.side)) el.classList.add('check');
      // Badges: the wrong move's square, and the mated king.
      if (cur.phase === 'wrong' && same(cur.wrong.move.to, at) && !cur.reply) html += '<svg class="badge" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#e0635f" stroke="#fff" stroke-width="2"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';
      if (cur.mated && cur.view === cur.history.length - 1 && pc && pc.piece === 'king' && pc.side !== cur.side) html += '<svg class="badge" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#c63a2e" stroke="#fff" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="13" font-weight="900" fill="#fff">#</text></svg>';
      if (cur.mated && cur.view === cur.history.length - 1 && s.last && same(s.last.to, at)) { el.classList.add('good'); html += '<svg class="badge" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#5fae4b" stroke="#fff" stroke-width="2"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
      el.innerHTML = html;
      el.setAttribute('aria-label', THAI_FILES[at.c] + (8 - at.r) + (pc ? ' ' + C.NAME[pc.piece] + C.sideName(pc.side) : ' ว่าง'));
      board.appendChild(el);
    }
    var arrows = [];
    if (h && cur.hint >= 2) arrows.push({ m: h, color: '#e2a400' });
    if (cur.phase === 'wrong') { arrows.push({ m: cur.wrong.move, color: '#e0635f' }); if (cur.reply) arrows.push({ m: cur.reply, color: '#c63a2e' }); }
    $('arrows').innerHTML = arrows.map(function (a) { return arrowSvg(a.m, a.color); }).join('');
  }
  function arrowSvg(m, color) {
    var f = flip(), p = function (at) { return { x: (f ? 7 - at.c : at.c) + 0.5, y: (f ? 7 - at.r : at.r) + 0.5 }; };
    var a = p(m.from), b = p(m.to), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    var end = { x: b.x - ux * 0.32, y: b.y - uy * 0.32 }, tip = { x: b.x - ux * 0.05, y: b.y - uy * 0.05 };
    var w = 0.17, l = { x: end.x - uy * w * 1.6, y: end.y + ux * w * 1.6 }, r = { x: end.x + uy * w * 1.6, y: end.y - ux * w * 1.6 };
    return '<g opacity=".85"><line x1="' + a.x + '" y1="' + a.y + '" x2="' + end.x + '" y2="' + end.y + '" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"/>' +
      '<polygon points="' + tip.x + ',' + tip.y + ' ' + l.x + ',' + l.y + ' ' + r.x + ',' + r.y + '" fill="' + color + '"/></g>';
  }
  function renderStats() {
    var done = session.results.filter(function (r) { return r === 'ok' || r === 'hint'; }).length;
    $('count').innerHTML = 'ข้อ ' + (session.index + 1) + '/' + session.list.length + '<small>แก้ได้ ' + done + ' · จนใน ' + cur.p.mate + ' ตา</small>';
    var t = '';
    for (var i = 0; i < session.list.length; i++) t += '<i class="' + (session.results[i] || (i === session.index ? 'now' : '')) + '"></i>';
    $('track').innerHTML = t;
    $('track').style.gridTemplateColumns = 'repeat(' + session.list.length + ',1fr)';
  }
  var ICON = {
    hint: '<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3zM10 20h4"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    sol: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    again: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/></svg>',
    ana: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8.5 11h5M11 8.5v5"/></svg>'
  };
  function tool(id, icon, label, disabled) { return '<button type="button" class="tool" data-act="' + id + '"' + (disabled ? ' disabled' : '') + '>' + ICON[icon] + label + '</button>'; }
  function renderBar() {
    var b = '', last = session.index + 1 >= session.list.length;
    if (cur.phase === 'play' || cur.phase === 'show') {
      b = tool('hint', 'hint', 'คำใบ้', !live() || cur.hint >= 2) + tool('back', 'back', 'ย้อน', cur.view === 0 || !!busy) + tool('fwd', 'fwd', 'ไปต่อ', cur.view >= cur.history.length - 1 || !!busy);
    } else if (cur.phase === 'wrong') {
      b = tool('solution', 'sol', 'ดูเฉลย', !!busy) + tool('next', 'next', last ? 'สรุปผล' : 'ข้อถัดไป', false) + '<button type="button" class="big retry" data-act="retry">ลองใหม่</button>';
    } else {
      b = tool('restart', 'again', 'เล่นใหม่', false) + tool('analyse', 'ana', 'วิเคราะห์', false) +
        tool('back', 'back', 'ย้อน', cur.view === 0) + tool('fwd', 'fwd', 'ไปต่อ', cur.view >= cur.history.length - 1) +
        '<button type="button" class="big go" data-act="next">' + (last ? 'สรุปผล' : 'ข้อถัดไป') + '</button>';
    }
    $('bar').innerHTML = b;
  }
  function renderEmpty() {
    clearInterval(timer);
    $('board').innerHTML = ''; $('arrows').innerHTML = ''; $('bar').innerHTML = ''; $('track').innerHTML = ''; $('count').textContent = '';
    say('ยังไม่มีโจทย์', 'ตัวกรองที่เลือกไม่มีโจทย์เลย กดปุ่มเฟืองมุมขวาบนเพื่อเลือกใหม่');
  }
  function finish() {
    clearInterval(timer);
    var res = session.results, n = session.list.length;
    var ok = res.filter(function (r) { return r === 'ok'; }).length, hinted = res.filter(function (r) { return r === 'hint'; }).length;
    var total = Math.round(session.times.reduce(function (a, b) { return a + (b || 0); }, 0) / 1000);
    $('sumTitle').textContent = ok + hinted === n ? 'เยี่ยมมาก! ครบทุกข้อ' : ok + hinted >= n / 2 ? 'เก่งมาก!' : 'สู้ต่อนะ!';
    $('sumDots').innerHTML = res.map(function (r, i) { return '<i class="' + r + '">' + (i + 1) + '</i>'; }).join('');
    $('sumText').textContent = 'แก้ได้ ' + (ok + hinted) + ' จาก ' + n + ' ข้อ' + (hinted ? ' (ใช้คำใบ้ ' + hinted + ' ข้อ)' : '');
    $('sumTime').textContent = 'เวลารวม ' + Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
    $('summary').showModal();
    resultSound(ok + hinted === n ? 'perfect' : 'set');
  }

  // ---- Input: tap a piece then a square, or drag ----
  var drag = null;
  function squareAt(x, y) {
    var el = document.elementFromPoint(x, y);
    el = el && el.closest ? el.closest('.sq') : null;
    return el && $('board').contains(el) ? { r: Number(el.dataset.r), c: Number(el.dataset.c) } : null;
  }
  function ownAt(at) { return cur.pieces.find(function (p) { return same(p.at, at) && p.side === cur.side; }); }
  $('boardWrap').addEventListener('pointerdown', function (e) {
    if (!cur || !live()) return;
    var at = squareAt(e.clientX, e.clientY);
    if (!at) return;
    if (cur.selected && !same(cur.selected, at) && R.legalDestinations(cur.pieces, cur.selected).some(function (d) { return same(d, at); })) { play(cur.selected, at); return; }
    var mine = ownAt(at);
    if (!mine) { if (cur.selected) { cur.selected = null; renderBoard(); } return; }
    cur.selected = at; renderBoard();
    var size = $('board').getBoundingClientRect().width / 8, g = document.createElement('div');
    g.className = 'ghost'; g.style.width = g.style.height = size * 0.92 + 'px';
    g.innerHTML = '<img src="' + src(mine.piece, mine.side) + '" alt="">';
    drag = { from: at, ghost: g, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    try { $('boardWrap').setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  $('boardWrap').addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moved) {
      drag.moved = true; document.body.appendChild(drag.ghost);
      var el = $('board').querySelector('.sq[data-r="' + drag.from.r + '"][data-c="' + drag.from.c + '"]');
      if (el) el.classList.add('lift');
    }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    var over = squareAt(e.clientX, e.clientY);
    $('board').querySelectorAll('.over').forEach(function (x) { x.classList.remove('over'); });
    if (over) { var o = $('board').querySelector('.sq[data-r="' + over.r + '"][data-c="' + over.c + '"]'); if (o) o.classList.add('over'); }
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
    // Released on another square (even with no move events in between, as some pens and tests do): a drag.
    var to = squareAt(e.clientX, e.clientY);
    if (!d.moved && (!to || same(to, d.from))) return;
    if (to && !same(to, d.from) && R.legalDestinations(cur.pieces, d.from).some(function (x) { return same(x, to); })) play(d.from, to);
    else renderBoard();
  }
  $('boardWrap').addEventListener('pointerup', endDrag);
  $('boardWrap').addEventListener('pointercancel', endDrag);

  $('bar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled || !cur) return;
    ({ hint: hint, back: function () { view(-1); }, fwd: function () { view(1); }, retry: retry, solution: showSolution,
      next: nextPuzzle, restart: restart, analyse: analyse })[b.dataset.act]();
  });
  document.addEventListener('keydown', function (e) {
    if (!cur || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') view(-1);
    else if (e.key === 'ArrowRight') view(1);
  });

  // ---- Settings (not remembered) ----
  var draft = null;
  function openSettings() {
    draft = { mates: filters.mates.slice(), sets: filters.sets.slice() };
    renderSettings();
    $('settings').returnValue = '';
    $('settings').showModal();
  }
  function toggle(list, v) { var i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); }
  function renderSettings() {
    $('mateChips').innerHTML = [1, 2, 3].map(function (n) {
      return '<button type="button" class="chip" data-mate="' + n + '" aria-pressed="' + (draft.mates.indexOf(n) >= 0) + '">จนใน ' + n + ' ตา</button>';
    }).join('');
    // Grouped by the defender's pieces: none (a lone king), one, two.
    $('setChips').innerHTML = GROUPS.map(function (title, g) {
      var list = DATA.sets.filter(function (s) { return s.defend.length === g; });
      if (!list.length) return '';
      return '<div class="groupHead"><h4>' + title + '</h4><button type="button" class="chip mini" data-group="' + g + '">' +
        (list.every(function (s) { return draft.sets.indexOf(s.id) >= 0; }) ? 'ไม่เลือกกลุ่มนี้' : 'เลือกทั้งกลุ่ม') + '</button></div><div class="sets">' + list.map(setChip).join('') + '</div>';
    }).join('');
    var total = C.available(DATA, draft);
    $('applySettings').disabled = !total;
    $('applySettings').textContent = total ? 'เริ่มชุดใหม่ (' + Math.min(C.SIZE, total) + ' ข้อ)' : 'ยังไม่มีโจทย์';
  }
  var GROUPS = ['ฝ่ายรับเหลือขุนตัวเดียว', 'ฝ่ายรับมีหมาก 1 ตัว', 'ฝ่ายรับมีหมาก 2 ตัว'];
  function setChip(s) {
      var n = C.available(DATA, { mates: draft.mates, sets: [s.id] });
      var pics = '<img src="' + src('king', 'white') + '" alt="">' + s.attack.map(function (p) { return '<img src="' + src(p, 'white') + '" alt="">'; }).join('') +
        '<span class="vs">ปะทะ</span><img src="' + src('king', 'black') + '" alt="">' + s.defend.map(function (p) { return '<img src="' + src(p, 'black') + '" alt="">'; }).join('');
      return '<button type="button" class="chip setChip' + (n ? '' : ' none') + '" data-set="' + s.id + '" aria-pressed="' + (draft.sets.indexOf(s.id) >= 0) + '">' +
        '<span class="pics">' + pics + '</span><span class="name">' + s.label + (s.defend.length ? '' : ' ปะทะ ขุน') + '</span><small>' + (n ? n + ' ข้อ' : 'ไม่มีโจทย์ตามจำนวนตาที่เลือก') + '</small></button>';
  }
  $('settingsForm').addEventListener('click', function (e) {
    var m = e.target.closest('[data-mate]'), s = e.target.closest('[data-set]'), g = e.target.closest('[data-group]');
    if (g) {
      var ids = DATA.sets.filter(function (x) { return x.defend.length === Number(g.dataset.group); }).map(function (x) { return x.id; });
      var all = ids.every(function (id) { return draft.sets.indexOf(id) >= 0; });
      draft.sets = draft.sets.filter(function (id) { return ids.indexOf(id) < 0; }).concat(all ? [] : ids);
      renderSettings();
    } else if (m) { toggle(draft.mates, Number(m.dataset.mate)); draft.mates.sort(); renderSettings(); }
    else if (s) { toggle(draft.sets, s.dataset.set); renderSettings(); }
    else if (e.target.id === 'allSets') { draft.sets = DATA.sets.map(function (x) { return x.id; }); renderSettings(); }
    else if (e.target.id === 'noSets') { draft.sets = []; renderSettings(); }
  });
  $('settings').addEventListener('close', function () {
    if ($('settings').returnValue !== 'apply' || !C.available(DATA, draft)) return;
    filters = draft; newSession();
  });
  $('settingsBtn').addEventListener('click', openSettings);
  $('sumAgain').addEventListener('click', function () { $('summary').close(); newSession(); });
  $('sumSettings').addEventListener('click', function () { $('summary').close(); openSettings(); });

  newSession();
})();
