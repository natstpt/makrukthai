/* Games outside the lessons (two players, or against the computer): counting to a draw (กติกา 2569 ข้อ ก 5)
 * and a simple computer player. Uses MakrukRules for every move, so the computer only plays legal moves.
 */
(function (root, factory) {
  'use strict';
  var play = factory(root && root.MakrukRules ? root.MakrukRules : (typeof require === 'function' ? require('./makruk-rules.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = play;
  if (root) root.MakrukPlay = play;
})(typeof window !== 'undefined' ? window : null, function (R) {
  'use strict';

  // Rough piece values for the computer: เบี้ย 1, เม็ด/เบี้ยหงาย 1.8, โคน 2.8, ม้า 3.6, เรือ 5.
  var VALUES = { pawn: 1, met: 1.8, promoted: 1.8, khon: 2.8, knight: 3.6, rook: 5, king: 0 };

  function same(a, b) { return a && b && a.r === b.r && a.c === b.c; }
  function opponent(side) { return side === 'white' ? 'black' : 'white'; }
  function count(pieces, side, type) { return pieces.filter(function (p) { return p.side === side && p.piece === type; }).length; }

  // ศักดิ์หมาก ceiling from the chasing side's pieces: the lowest of the pieces it has (ข้อ ก 5.3).
  function ceilingFor(pieces, side) {
    var caps = [], rooks = count(pieces, side, 'rook'), khons = count(pieces, side, 'khon'), knights = count(pieces, side, 'knight');
    if (rooks) caps.push(rooks > 1 ? 8 : 16);
    if (khons) caps.push(khons > 1 ? 22 : 44);
    if (knights) caps.push(knights > 1 ? 32 : 64);
    if (count(pieces, side, 'met') || count(pieces, side, 'promoted')) caps.push(64);
    return caps.length ? Math.min.apply(null, caps) : 64;
  }

  // The count after `mover` has moved and `pieces` is the new position. null = not counting.
  // Only the weaker side counts, one more each time it moves (both sides have moved once).
  // Board count (ศักดิ์กระดาน): no unpromoted pawns and both sides still have pieces; it starts only when the weaker
  // side asks for it (requestBoardCount), counting 1 on its next move up to 64.
  // Special board count (ข้อ ข 4.2): asked for while unpromoted pawns are still on the board but the shape no longer
  // changes (requestSpecialCount); it counts 1 to 64 the same way and carries on if the pawns go.
  // Piece count (ศักดิ์หมาก): starts by itself when one side has only its king; the lone king says the number of
  // pieces left after that move + 1 on its first move, up to the ceiling of the chasing side's pieces. A capture never restarts it.
  // A board count switches to it when a capture leaves a lone king (not for a king that was already alone when the
  // special count was asked for). A special count goes on while unpromoted pawns are still on the board, and switches
  // only once they are gone.
  // In both, once the counting side has said the last number (64 or the ceiling) the other side has one more move;
  // if it does not mate, the counting side makes its next move, says one more (65, or ceiling + 1) and the game is
  // drawn.
  function nextCount(current, pieces, mover) {
    if (hasPawns(pieces) && !(current && current.special)) return null;
    var white = pieces.filter(function (p) { return p.side === 'white'; }).length;
    var black = pieces.length - white;
    if (white === 1 && black === 1) return current; // bare kings: MakrukRules reports the draw
    var c = current ? Object.assign({}, current) : null;
    var lone = loneSide(pieces);
    if (lone && !hasPawns(pieces) && (!c || c.kind !== 'piece') && !(c && c.lone === lone))
      return { kind: 'piece', counter: lone, value: null, start: pieces.length + 1, ceiling: ceilingFor(pieces, opponent(lone)), extra: false, draw: false, special: !!(c && c.special) };
    if (!c) return null; // board count: only on request
    if (mover === c.counter) {
      // The lone king says pieces + 1 counted after its own first move, so a capture on that move lowers the start.
      if (c.kind === 'piece' && c.value === null) c.start = pieces.length + 1;
      return advance(c);
    }
    return c;
  }
  function hasPawns(pieces) { return pieces.some(function (p) { return p.piece === 'pawn'; }); }
  function loneSide(pieces) {
    var white = pieces.filter(function (p) { return p.side === 'white'; }).length, black = pieces.length - white;
    return white === 1 ? 'white' : black === 1 ? 'black' : null;
  }
  // Can a board count be asked for now (no pawns left, both sides still have more than a king, not counting yet)?
  function canRequestBoardCount(pieces, current) {
    if (current || hasPawns(pieces)) return false;
    var white = pieces.filter(function (p) { return p.side === 'white'; }).length;
    return white > 1 && pieces.length - white > 1;
  }
  // `side` (the weaker side) asks for the board count; it says 1 on its next move.
  function requestBoardCount(side) { return { kind: 'board', counter: side, value: null, start: 1, ceiling: 64, extra: false, draw: false }; }
  // Plies since the last pawn move or capture, from the move records (makruk-notation.js) of the game so far.
  function quietPlies(records) {
    var n = 0;
    for (var i = records.length - 1; i >= 0 && records[i].piece !== 'pawn' && !records[i].capture; i--) n++;
    return n;
  }
  // Every unpromoted pawn of both sides is blocked: the square in front of it is taken (pawns head to head,
  // ข้อ ข 4.2's example). A capture a pawn could make does not unlock it; captures are watched by quietPlies.
  function pawnsLocked(pieces) {
    return pieces.every(function (p) {
      if (p.piece !== 'pawn') return true;
      var ahead = { r: p.at.r + (p.side === 'white' ? -1 : 1), c: p.at.c };
      return pieces.some(function (x) { return same(x.at, ahead); });
    });
  }
  // Moves since the last pawn move or capture (the pawns and the pieces of both sides are unchanged) that bring a
  // piece back to a square it already stood on in that stretch, into a position that has not stood before: pieces
  // walking to and fro without repeating. Exact repeats are left to the threefold-repetition draw. Records carry
  // the position after the move (fen) when the game page keeps it; startFen is the position before the first record.
  function shuffleMoves(records, startFen) {
    var start = records.length - quietPlies(records), seen = {}, n = 0;
    var before = start > 0 ? records[start - 1].fen : startFen, positions = before ? [before] : [];
    records.slice(start).forEach(function (m) {
      var been = seen[m.from] || [m.from], repeat = !!m.fen && positions.indexOf(m.fen) >= 0;
      if (m.fen) positions.push(m.fen);
      if (been.indexOf(m.to) >= 0 && !repeat) n++;
      delete seen[m.from];
      seen[m.to] = been.concat([m.to]);
    });
    return n;
  }
  // The shape no longer changes (รูปหมากไม่เปลี่ยนแปลง) once, with no pawn move and no capture:
  // every pawn is locked and LOCKED_PLIES plies (3 moves each) have passed, or pieces have walked back to squares
  // they came from more than SHUFFLES times (เดินวนไปมา).
  var LOCKED_PLIES = 6, SHUFFLES = 3;
  // Can the special board count (ข้อ ข 4.2) be asked for now? Unpromoted pawns are still on the board, nothing is
  // being counted yet, and the shape no longer changes (see above), judged from the game's move records. The time
  // condition (under 5 minutes) is left out: the games here have no clock.
  function canRequestSpecialCount(pieces, current, records, startFen) {
    if (current || !hasPawns(pieces)) return false;
    return (quietPlies(records) >= LOCKED_PLIES && pawnsLocked(pieces)) || shuffleMoves(records, startFen) > SHUFFLES;
  }
  function requestSpecialCount(side, pieces) {
    return { kind: 'board', counter: side, value: null, start: 1, ceiling: 64, extra: false, draw: false, special: true, lone: loneSide(pieces) };
  }
  function advance(c) {
    if (c.extra) { c.value++; c.draw = true; return c; } // past the last number: drawn
    c.value = c.value === null ? c.start : c.value + 1;
    if (c.value >= c.ceiling) c.extra = true;
    return c;
  }
  // Rounded to a tenth, so equal sides compare equal (0.1 steps in floating point do not add up exactly).
  function material(pieces, side) { return Math.round(pieces.filter(function (p) { return p.side === side; }).reduce(function (s, p) { return s + VALUES[p.piece]; }, 0) * 10) / 10; }
  // Short text for the turn line, e.g. "แดงนับศักดิ์หมาก 7/16".
  function countText(c, sideName) {
    if (!c) return '';
    var who = sideName ? sideName(c.counter) : '', name = c.kind === 'board' ? 'นับศักดิ์กระดาน' + (c.special ? 'กรณีพิเศษ' : '') : 'นับศักดิ์หมาก';
    if (c.draw) return who + 'นับเกิน ' + c.ceiling + ' · เสมอ';
    return c.value === null ? who + 'เริ่ม' + name + (c.kind === 'piece' ? ' ' + c.start + ' ถึง ' + c.ceiling : ' 1 ถึง 64') : who + name + ' ' + c.value + '/' + c.ceiling;
  }

  // Static exchange on `square`: what `side` can win there by capturing first with its cheapest piece,
  // when both sides keep recapturing only while it pays.
  function exchange(pieces, square, side, depth) {
    var victim = pieces.find(function (p) { return same(p.at, square); });
    if (!victim || victim.side === side || depth > 6) return 0;
    var best = null, bestValue = Infinity;
    R.legalMoves(pieces, side).forEach(function (m) {
      if (!same(m.to, square)) return;
      var attacker = pieces.find(function (p) { return same(p.at, m.from); });
      var value = attacker.piece === 'king' ? 100 : VALUES[attacker.piece];
      if (value < bestValue) { bestValue = value; best = m; }
    });
    if (!best) return 0;
    var after = R.applyMove(pieces, best.from, best.to);
    // A pawn that promotes as it takes has gained the difference too (what the other side wins back is the promoted pawn).
    var mover = pieces.find(function (p) { return same(p.at, best.from); }), landed = after.find(function (p) { return same(p.at, square); });
    var promotion = mover.piece === 'pawn' && landed.piece === 'promoted' ? VALUES.promoted - VALUES.pawn : 0;
    return Math.max(0, VALUES[victim.piece] + promotion - exchange(after, square, opponent(side), depth + 1));
  }

  // Opening shapes (ทรงหมาก). Each step is [piece, from, to, final square of that piece's route]; a step is done once
  // the piece stands on `to` or has already gone on to its final square.
  // centre: take the centre with two pawns first, then bring the pieces up behind them, the met ending on จ3 (ง6 red).
  //   White: บ.จ3-จ4, บ.ง3-ง4, ม.ช1-จ2, ม.ข1-ง2, ม็.จ1-ฉ2-จ3, ค.ฉ1-ฉ2, ค.ค1-ค2-ง3.
  //   Red:   บ.ง6-ง5, บ.จ6-จ5, ม.ข8-ง7, ม.ช8-จ7, ม็.ง8-ค7-ง6, ค.ค8-ค7, ค.ฉ8-ฉ7-จ6.
  // flank (white only; the game page never gives it to red): the pawns go up one file to the side (จ4 ฉ4), the met and
  // a knight come up behind them. The khon on ฉ1 is left out: ฉ2, จ2 or ช2 depends on the position, so the AI chooses.
  //   White: บ.จ3-จ4, บ.ฉ3-ฉ4, ม.ช1-ฉ3, ม็.จ1-ฉ2-จ3, ค.ค1-ค2, ม.ข1-ง2.
  var OPENING = {
    white: [['pawn', 'e3', 'e4'], ['pawn', 'd3', 'd4'], ['knight', 'g1', 'e2'], ['knight', 'b1', 'd2'], ['met', 'e1', 'f2', 'e3'],
      ['met', 'f2', 'e3'], ['khon', 'f1', 'f2'], ['khon', 'c1', 'c2', 'd3'], ['khon', 'c2', 'd3']],
    black: [['pawn', 'd6', 'd5'], ['pawn', 'e6', 'e5'], ['knight', 'b8', 'd7'], ['knight', 'g8', 'e7'], ['met', 'd8', 'c7', 'd6'],
      ['met', 'c7', 'd6'], ['khon', 'c8', 'c7'], ['khon', 'f8', 'f7', 'e6'], ['khon', 'f7', 'e6']]
  };
  var OPENINGS = {
    centre: OPENING,
    flank: {
      white: [['pawn', 'e3', 'e4'], ['pawn', 'f3', 'f4'], ['knight', 'g1', 'f3'], ['met', 'e1', 'f2', 'e3'], ['met', 'f2', 'e3'],
        ['khon', 'c1', 'c2'], ['knight', 'b1', 'd2']]
    }
  };
  function square(name) { return { r: 8 - Number(name[1]), c: 'abcdefgh'.indexOf(name[0]) }; }
  // Against the flank shape red may push a pawn up to stand in front of it (เบี้ยสูง: a red pawn on ง4 facing white's
  // จ4 ฉ4). The answer comes before the rest of the shape: the khon to ค2 first, then the pawn to ข4, then that pawn
  // takes the pawn on ค5 when the exchange is even.
  var FLANK_ANSWER = {
    white: { pawn: 'd4', steps: [['khon', 'c1', 'c2'], ['pawn', 'b3', 'b4', 'c5'], ['pawn', 'b4', 'c5']] }
  };
  // White's three centre pawns (ง4 จ4 ฉ4): after the rest of its shape, when red does not stand in the centre (no red
  // pawn on ค5 ง5 จ5 ฉ5), the missing one of them goes up too, for room to attack. Red keeps its shape as it is.
  var CENTRE_PAWNS = [['pawn', 'd3', 'd4'], ['pawn', 'e3', 'e4'], ['pawn', 'f3', 'f4']];
  function centreFree(pieces) {
    return !pieces.some(function (p) { return p.side === 'black' && p.piece === 'pawn' && p.at.r === 3 && p.at.c >= 2 && p.at.c <= 5; });
  }
  function shapeSteps(pieces, side, shape, answerOnly) {
    var steps = answerOnly ? [] : (OPENINGS[shape] && OPENINGS[shape][side] || OPENING[side]), answer = FLANK_ANSWER[side];
    if (!answerOnly && side === 'white' && centreFree(pieces)) steps = steps.concat(CENTRE_PAWNS);
    if (shape === 'flank' && answer && pieces.some(function (p) { return p.side !== side && p.piece === 'pawn' && same(p.at, square(answer.pawn)); }))
      steps = answer.steps.concat(steps);
    return steps;
  }
  // The opening moves of `shape` (default centre) that can be played now, in order. Steps already done or no longer
  // possible are skipped.
  function openingMoves(pieces, side, shape, answerOnly, only) {
    var legal = R.legalMoves(pieces, side), out = [];
    (only || shapeSteps(pieces, side, shape, answerOnly)).forEach(function (step) {
      var piece = step[0], from = square(step[1]), to = square(step[2]);
      var targets = [to].concat(step[3] ? [square(step[3])] : []);
      if (pieces.some(function (p) { return p.side === side && p.piece === piece && targets.some(function (t) { return same(p.at, t); }); })) return;
      var move = legal.find(function (m) {
        if (!same(m.from, from) || !same(m.to, to)) return false;
        var moving = pieces.find(function (p) { return same(p.at, from); });
        return moving.piece === piece;
      });
      if (move) out.push(move);
    });
    return out;
  }
  function openingMove(pieces, side, shape) { return openingMoves(pieces, side, shape)[0] || null; }

  // Positional terms: pieces toward the centre (ง4 จ4 ง5 จ5 most of all), pawns and khon moving forward,
  // the king kept at home.
  var CENTRE = ['d4', 'e4', 'd5', 'e5'].map(square);
  function positional(moving, from, to, side) {
    var centre = function (at) { return 3.5 - Math.max(Math.abs(at.r - 3.5), Math.abs(at.c - 3.5)); };
    var inCentre = function (at) { return CENTRE.some(function (c) { return same(c, at); }); };
    var forward = side === 'white' ? from.r - to.r : to.r - from.r;
    var score = 0;
    if (moving.piece === 'knight' || moving.piece === 'met' || moving.piece === 'khon') score += (centre(to) - centre(from)) * 0.15;
    if (moving.piece !== 'king' && moving.piece !== 'rook') score += (inCentre(to) ? 0.3 : 0) - (inCentre(from) ? 0.3 : 0);
    if (moving.piece === 'pawn' || moving.piece === 'khon') score += forward * 0.08;
    if (moving.piece === 'king' && to.r > 1 && to.r < 6) score -= 0.15;
    return score;
  }

  // Pick a move for `side`: mate at once, never allow a mate in one, weigh captures by the exchange that follows,
  // keep pieces from hanging, avoid a third repetition when ahead, and add a little variety so games differ.
  // options.random: 0..1 (default Math.random); options.shape: the opening shape to follow (OPENINGS, default centre).
  function chooseMove(pieces, side, options) {
    options = options || {};
    var random = options.random || Math.random, enemy = opponent(side);
    var mine = pieces.filter(function (p) { return p.side === side; }).reduce(function (s, p) { return s + VALUES[p.piece]; }, 0);
    var theirs = pieces.filter(function (p) { return p.side === enemy; }).reduce(function (s, p) { return s + VALUES[p.piece]; }, 0);
    var ahead = mine - theirs;
    var scored = [];
    R.legalMoves(pieces, side).forEach(function (move) {
      var moving = pieces.find(function (p) { return same(p.at, move.from); });
      var taken = pieces.find(function (p) { return same(p.at, move.to); });
      var after = R.applyMove(pieces, move.from, move.to), status = R.gameStatus(after, enemy);
      // options.repeats(position, side to move): how often that position has stood before; a third time is a draw.
      if (status.state === 'playing' && options.repeats && options.repeats(after, enemy) >= 2) status = { state: 'repetition' };
      var score, lost = 0;
      if (status.state === 'checkmate') score = 10000;
      else if (status.state !== 'playing') score = ahead > 1 ? -500 : ahead < -1 ? 300 : 0; // a draw: avoid it when ahead
      else {
        var landed = after.find(function (p) { return same(p.at, move.to); });
        var gain = (taken ? VALUES[taken.piece] : 0) + (landed.piece === 'promoted' && moving.piece === 'pawn' ? VALUES.promoted - VALUES.pawn : 0);
        score = gain - exchange(after, move.to, enemy, 0);
        // The worst exchange the opponent can start against our other pieces.
        var replies = R.legalMoves(after, enemy), threatened = [], loss = 0;
        replies.forEach(function (m) {
          var target = after.find(function (p) { return same(p.at, m.to) && p.side === side; });
          if (target && !same(m.to, move.to) && !threatened.some(function (t) { return same(t, m.to); })) threatened.push(m.to);
        });
        threatened.forEach(function (at) { loss = Math.max(loss, exchange(after, at, enemy, 0)); });
        score -= loss * 0.9;
        // What the move gives away in material alone (the opening shape plays no step that loses any).
        lost = Math.max(0, -(gain - exchange(after, move.to, enemy, 0)), loss);
        // Never walk into a mate in one.
        if (replies.some(function (m) { var next = R.applyMove(after, m.from, m.to); return R.inCheck(next, side) && R.gameStatus(next, side).state === 'checkmate'; })) score -= 5000;
        if (status.check) score += 0.3;
        score += positional(moving, move.from, move.to, side);
        // When chasing a lone king, keep it close to the edge and our king close to it.
        if (theirs === 0 && options.count) {
          var king = after.find(function (p) { return p.side === enemy && p.piece === 'king'; });
          var ours = after.find(function (p) { return p.side === side && p.piece === 'king'; });
          var edge = Math.min(king.at.r, 7 - king.at.r, king.at.c, 7 - king.at.c);
          var gap = Math.max(Math.abs(king.at.r - ours.at.r), Math.abs(king.at.c - ours.at.c));
          score -= edge * 0.4 + gap * 0.15 + R.legalMoves(after, enemy).length * 0.1;
        }
      }
      scored.push({ move: move, score: score, capture: !!taken, lost: lost });
    });
    if (!scored.length) return null;
    var top = Math.max.apply(null, scored.map(function (x) { return x.score; }));
    // Opening: build the shape while nothing is being exchanged and the king is not attacked.
    // Opening: follow the shape while nothing is being exchanged and the king is not attacked. Take the first step
    // that is safe (no pawn or piece is lost to an exchange, by material alone: a good square does not make up for it);
    // a step that is not safe yet waits.
    if (options.opening !== false && !R.inCheck(pieces, side) && !underAttack(pieces, side) && !scored.some(function (x) { return x.capture && x.score > 0.5; })) {
      var steps = openingMoves(pieces, side, options.shape, options.answerOnly, options.steps);
      for (var i = 0; i < steps.length; i++) {
        var entry = scored.find(function (x) { return same(x.move.from, steps[i].from) && same(x.move.to, steps[i].to); });
        if (entry && entry.lost < 0.3 && entry.score > -0.5 && entry.score >= top - 0.6) return steps[i];
      }
    }
    if (options.openingOnly) return null;
    // Easy level: now and then a move is picked at random instead of the best one (never when a mate in one is there),
    // so a beginner can win material and learn from the AI's mistakes.
    if (options.mistakes && top < 10000 && random() < options.mistakes) {
      var others = scored.filter(function (x) { return x.score < top - 0.5; });
      if (others.length) return others[Math.floor(random() * others.length)].move;
    }
    var best = null, bestScore = -Infinity;
    scored.forEach(function (x) { var s = x.score + random() * 0.35; if (s > bestScore) { bestScore = s; best = x.move; } });
    return best;
  }
  // A pawn of the other side past its 4th rank (เบี้ยสูง: a white pawn on rank 5 or further, a red one on rank 4 or
  // lower): the game has left the quiet opening the shapes are made for, and the engine AI leaves its shape.
  function pawnAdvanced(pieces, side) {
    return pieces.some(function (p) { return p.piece === 'pawn' && p.side !== side && (p.side === 'white' ? p.at.r <= 3 : p.at.r >= 4); });
  }
  // The opening-shape move chooseMove would play now (the shape's pawns first), or null when the shape is done or has
  // to wait; the engine AI plays these before handing the game to the engine.
  function openingChoice(pieces, side, shape) { return chooseMove(pieces, side, { openingOnly: true, shape: shape }); }
  // The advanced-pawn answer alone (FLANK_ANSWER), for the engine AI after it has left the opening shape.
  function flankAnswer(pieces, side, shape) { return chooseMove(pieces, side, { openingOnly: true, answerOnly: true, shape: shape }); }
  // Red's opening for the engine AI (red moves second). The two centre pawns ง5 จ5 are fixed: each is played as soon
  // as it loses no material, whatever a short engine search prefers ({move}). Next come the knights, but on squares the
  // engine chooses (a knight further up is sometimes better than ง7 จ7): while the game is quiet and a knight is still
  // at home, the engine searches only the moves of the knights at home ({moves}); while a centre pawn waits for its
  // square to be safe, only the knight moves after which it is. Until both centre pawns are up, no
  // pawn other than ง จ moves forward without taking, unless red is in check ({moves}): pushing ค5 or ฉ5 early leaves
  // red behind. null when none of this applies any more (the shape's met and khon follow as usual).
  var RED_CENTRE = [['pawn', 'd6', 'd5'], ['pawn', 'e6', 'e5']], KNIGHT_HOME = ['b8', 'g8'].map(square);
  function redOpening(pieces) {
    var side = 'black', pawn = chooseMove(pieces, side, { openingOnly: true, steps: RED_CENTRE });
    if (pawn) return { move: pawn };
    var legal = R.legalMoves(pieces, side), at = function (s) { return pieces.find(function (p) { return same(p.at, s); }); };
    var quiet = !R.inCheck(pieces, side) && !underAttack(pieces, side) && !underAttack(pieces, opponent(side));
    var knights = legal.filter(function (m) { var p = at(m.from); return p.piece === 'knight' && KNIGHT_HOME.some(function (h) { return same(h, m.from); }) && !at(m.to); });
    var pending = RED_CENTRE.some(function (step) { var p = at(square(step[1])); return p && p.side === side && p.piece === 'pawn'; });
    if (quiet && knights.length) {
      // A centre pawn still to come but not safe yet: the knights that make it safe on red's next move (ม.ข8-ง7
      // guards จ5, ม.ช8-จ7 guards ง5), when there are any, so white cannot take the square first.
      var ready = pending && knights.filter(function (m) { return chooseMove(R.applyMove(pieces, m.from, m.to), side, { openingOnly: true, steps: RED_CENTRE }); });
      return { moves: ready && ready.length ? ready : knights };
    }
    if (!pending || R.inCheck(pieces, side)) return null;
    var calm = legal.filter(function (m) { var p = at(m.from); return !(p.piece === 'pawn' && !at(m.to) && m.from.c !== 3 && m.from.c !== 4); });
    return calm.length && calm.length < legal.length ? { moves: calm } : null;
  }
  // Can the opponent win material right now (a capture whose exchange pays)?
  function underAttack(pieces, side) {
    var enemy = opponent(side), seen = [];
    return R.legalMoves(pieces, enemy).some(function (m) {
      var target = pieces.find(function (p) { return same(p.at, m.to) && p.side === side; });
      if (!target || seen.some(function (t) { return same(t, m.to); })) return false;
      seen.push(m.to);
      return exchange(pieces, m.to, enemy, 0) > 0;
    });
  }

  return { canRequestBoardCount: canRequestBoardCount, requestBoardCount: requestBoardCount, canRequestSpecialCount: canRequestSpecialCount, requestSpecialCount: requestSpecialCount, quietPlies: quietPlies, pawnsLocked: pawnsLocked, LOCKED_PLIES: LOCKED_PLIES, SHUFFLES: SHUFFLES, shuffleMoves: shuffleMoves, material: material, VALUES: VALUES, OPENING: OPENING, OPENINGS: OPENINGS, openingMove: openingMove, openingMoves: openingMoves, openingChoice: openingChoice, flankAnswer: flankAnswer, redOpening: redOpening, pawnAdvanced: pawnAdvanced, ceilingFor: ceilingFor, nextCount: nextCount, countText: countText, exchange: exchange, chooseMove: chooseMove };
});
