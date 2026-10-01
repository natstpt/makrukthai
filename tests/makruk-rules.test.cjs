'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../makruk-rules.js');
let assertions = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
const yes = (actual, label) => check(!!actual, true, label);
const no = (actual, label) => check(!!actual, false, label);
const p = (piece, side, r, c, metadata = {}) => ({ ...metadata, piece, side, at: { r, c } });
const key = at => `${at.r},${at.c}`;
const keys = positions => positions.map(key).sort();
const has = (positions, r, c) => positions.some(at => at.r === r && at.c === c);
const allAttacks = (pieces, side) => {
  const result = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (R.isAttacked(pieces, { r, c }, side)) result.push({ r, c });
  return keys(result);
};

// Every movement type from row 4, column 3 (Thai ง4), for each side.
const diagonals = [{ r: 3, c: 2 }, { r: 3, c: 4 }, { r: 5, c: 2 }, { r: 5, c: 4 }];
const orthogonals = [{ r: 3, c: 3 }, { r: 5, c: 3 }, { r: 4, c: 2 }, { r: 4, c: 4 }];
const knights = [{ r: 2, c: 2 }, { r: 2, c: 4 }, { r: 3, c: 1 }, { r: 3, c: 5 }, { r: 5, c: 1 }, { r: 5, c: 5 }, { r: 6, c: 2 }, { r: 6, c: 4 }];
const rooks = [];
for (let i = 0; i < 8; i++) {
  if (i !== 4) rooks.push({ r: i, c: 3 });
  if (i !== 3) rooks.push({ r: 4, c: i });
}
for (const side of ['white', 'black']) {
  const forward = side === 'white' ? 3 : 5;
  const expectedMoves = {
    king: diagonals.concat(orthogonals), rook: rooks, knight: knights,
    met: diagonals, promoted: diagonals, khon: diagonals.concat([{ r: forward, c: 3 }]),
    pawn: [{ r: forward, c: 3 }]
  };
  for (const type of Object.keys(expectedMoves)) {
    const pieces = [p(type, side, 4, 3)];
    check(keys(R.pseudoDestinations(pieces, pieces[0].at)), keys(expectedMoves[type]), `${side} ${type} moves`);
    check(keys(R.legalDestinations(pieces, pieces[0].at)), keys(expectedMoves[type]), `${side} ${type}, isolated lesson without king`);
    const attacks = type === 'pawn' ? [{ r: forward, c: 2 }, { r: forward, c: 4 }] : expectedMoves[type];
    check(allAttacks(pieces, side), keys(attacks), `${side} ${type} attacks`);
  }
}

const rookBoard = [p('rook', 'white', 4, 3), p('pawn', 'white', 2, 3), p('pawn', 'black', 4, 5), p('king', 'black', 4, 1)];
const rookMoves = R.pseudoDestinations(rookBoard, { r: 4, c: 3 });
yes(has(rookMoves, 3, 3), 'rook reaches square before friendly blocker');
no(has(rookMoves, 2, 3), 'rook cannot capture own piece');
no(has(rookMoves, 1, 3), 'rook cannot pass friendly blocker');
yes(has(rookMoves, 4, 5), 'rook can capture first enemy piece');
no(has(rookMoves, 4, 6), 'rook cannot pass captured enemy');
no(has(rookMoves, 4, 1), 'rook cannot capture a king');
no(has(rookMoves, 4, 0), 'enemy king also blocks ray');
yes(R.isAttacked(rookBoard, { r: 2, c: 3 }, 'white'), 'rook defends occupied friendly square');
no(R.isAttacked(rookBoard, { r: 1, c: 3 }, 'white'), 'rook attack stops after blocker');
yes(R.isAttacked(rookBoard, { r: 4, c: 1 }, 'white'), 'king square remains attacked despite king capture exclusion');
check(R.applyMove(rookBoard, { r: 4, c: 3 }, { r: 4, c: 1 }), rookBoard, 'attempted king capture does not alter position');
const rookCapture = R.applyMove(rookBoard, { r: 4, c: 3 }, { r: 4, c: 5 });
check(rookCapture.length, 3, 'capture removes only enemy destination piece');
check(rookBoard[0].at, { r: 4, c: 3 }, 'capture leaves original board untouched');

for (const side of ['white', 'black']) {
  const enemy = side === 'white' ? 'black' : 'white';
  const forward = side === 'white' ? 3 : 5;
  const pawnBoard = [p('pawn', side, 4, 3), p('met', enemy, forward, 2), p('pawn', enemy, forward, 3), p('rook', enemy, forward, 4)];
  check(keys(R.pseudoDestinations(pawnBoard, { r: 4, c: 3 })), keys([{ r: forward, c: 2 }, { r: forward, c: 4 }]), `${side} pawn captures diagonally, blocked straight`);
  const noSpecial = [p('pawn', side, side === 'white' ? 5 : 2, 3)];
  check(R.pseudoDestinations(noSpecial, noSpecial[0].at).length, 1, `${side} pawn has no opening double step`);
}

const knightBlockers = [p('knight', 'white', 4, 3), p('pawn', 'white', 3, 3), p('met', 'white', 2, 2), p('rook', 'black', 2, 4), p('king', 'black', 3, 1)];
yes(has(R.pseudoDestinations(knightBlockers, { r: 4, c: 3 }), 2, 4), 'knight jumps intervening blockers and captures');
no(has(R.pseudoDestinations(knightBlockers, { r: 4, c: 3 }), 2, 2), 'knight cannot capture own destination');
no(has(R.pseudoDestinations(knightBlockers, { r: 4, c: 3 }), 3, 1), 'knight cannot capture king');

const pinned = [p('king', 'white', 7, 3), p('rook', 'white', 6, 3), p('rook', 'black', 0, 3), p('king', 'black', 0, 7)];
no(R.inCheck(pinned, 'white'), 'pinned rook currently shields white king');
yes(R.legalDestinations(pinned, { r: 6, c: 3 }).every(at => at.c === 3), 'pinned rook cannot expose its king');
yes(has(R.legalDestinations(pinned, { r: 6, c: 3 }), 0, 3), 'pinned rook can capture attacker along pin line');
check(R.applyMove(pinned, { r: 6, c: 3 }, { r: 6, c: 4 }), pinned, 'self-check move is rejected');

const checked = [p('king', 'white', 7, 3), p('rook', 'white', 6, 0), p('rook', 'black', 0, 3), p('king', 'black', 0, 7)];
yes(R.inCheck(checked, 'white'), 'white king is checked by open rook');
check(keys(R.legalDestinations(checked, { r: 6, c: 0 })), ['6,3'], 'blocking check is only safe rook response');
no(R.inCheck(R.applyMove(checked, { r: 6, c: 0 }, { r: 6, c: 3 }), 'white'), 'blocking move resolves check');

const adjacentKings = [p('king', 'white', 4, 3), p('king', 'black', 2, 3)];
for (const c of [2, 3, 4]) no(has(R.legalDestinations(adjacentKings, { r: 4, c: 3 }), 3, c), 'king cannot enter enemy king attack');
const defendedCapture = [p('king', 'white', 4, 3), p('pawn', 'black', 3, 3), p('rook', 'black', 3, 5), p('king', 'black', 0, 7)];
no(has(R.legalDestinations(defendedCapture, { r: 4, c: 3 }), 3, 3), 'king cannot capture defended enemy');
no(has(R.legalDestinations([p('king', 'white', 7, 3)], { r: 7, c: 3 }), 7, 5), 'no castling move');

const whitePromotion = [p('pawn', 'white', 3, 2, { id: 'student-pawn', label: 'practice' })];
const promotedWhite = R.applyMove(whitePromotion, { r: 3, c: 2 }, { r: 2, c: 2 });
check(promotedWhite[0], p('promoted', 'white', 2, 2, { id: 'student-pawn', label: 'practice' }), 'white promotion at rank 6 retains metadata');
check(whitePromotion[0].piece, 'pawn', 'promotion does not mutate original piece');
check(R.applyMove([p('pawn', 'black', 4, 5)], { r: 4, c: 5 }, { r: 5, c: 5 })[0].piece, 'promoted', 'black promotion at rank 3');
const promotionCapture = R.applyMove([p('pawn', 'white', 3, 2), p('met', 'black', 2, 3)], { r: 3, c: 2 }, { r: 2, c: 3 });
check(promotionCapture.length, 1, 'promotion capture removes captured piece');
check(promotionCapture[0].piece, 'promoted', 'promotion also occurs on capture');
check(R.applyMove([p('pawn', 'white', 4, 2)], { r: 4, c: 2 }, { r: 3, c: 2 })[0].piece, 'pawn', 'white pawn remains pawn before promotion rank');
check(R.applyMove([p('pawn', 'black', 3, 2)], { r: 3, c: 2 }, { r: 4, c: 2 })[0].piece, 'pawn', 'black pawn remains pawn before promotion rank');
yes(has(R.legalDestinations(promotedWhite, promotedWhite[0].at), 3, 3), 'promoted pawn can move diagonally backward');
no(has(R.legalDestinations(promotedWhite, promotedWhite[0].at), 1, 2), 'promoted pawn loses forward pawn move');
const cloned = R.clonePieces(whitePromotion);
cloned[0].at.r = 7;
check(whitePromotion[0].at.r, 3, 'clone owns separate coordinate object');

const mate = [p('king', 'black', 0, 7), p('king', 'white', 1, 5), p('rook', 'white', 7, 7)];
check(R.gameStatus(mate, 'black'), { state: 'checkmate', check: true, winner: 'white' }, 'checked corner king with all exits covered is mate');
const stalemate = [p('king', 'black', 0, 7), p('king', 'white', 1, 5), p('met', 'white', 2, 6)];
check(R.gameStatus(stalemate, 'black'), { state: 'stalemate', check: false, winner: null }, 'corner king without moves or check is stalemate');
const bare = [p('king', 'white', 7, 3), p('king', 'black', 0, 4)];
check(R.gameStatus(bare, 'white'), { state: 'draw', check: false, winner: null }, 'safe bare kings draw');
check(R.gameStatus(bare.concat(p('met', 'white', 4, 3)), 'white').state, 'playing', 'no unverified insufficient-material shortcut');

const full = [];
const whiteBack = ['rook', 'knight', 'khon', 'king', 'met', 'khon', 'knight', 'rook'];
const blackBack = ['rook', 'knight', 'khon', 'met', 'king', 'khon', 'knight', 'rook'];
for (let c = 0; c < 8; c++) full.push(p(whiteBack[c], 'white', 7, c), p('pawn', 'white', 5, c), p('pawn', 'black', 2, c), p(blackBack[c], 'black', 0, c));
check(full.length, 32, 'standard setup has 32 pieces');
check(R.legalMoves(full, 'white').length, 23, 'standard white setup has 23 legal first moves');
check(R.legalMoves(full, 'black').length, 23, 'standard black setup has 23 legal first moves');
check(R.gameStatus(full, 'white'), { state: 'playing', check: false, winner: null }, 'standard setup is playable');
let position = full;
for (let turn = 0; turn < 40; turn++) {
  const side = turn % 2 ? 'black' : 'white';
  const moves = R.legalMoves(position, side);
  if (!moves.length) break;
  const move = moves[(turn * 7 + 3) % moves.length];
  position = R.applyMove(position, move.from, move.to);
  no(R.inCheck(position, side), `legal playout move ${turn + 1} keeps mover's king safe`);
  check(position.filter(piece => piece.piece === 'king').length, 2, `playout move ${turn + 1} retains both kings`);
}

const browserContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'makruk-rules.js'), 'utf8'), browserContext);
check(typeof browserContext.window.MakrukRules.legalMoves, 'function', 'browser global export available');

// Verify Day 2's actual teaching positions independently of UI rendering.
const day2Context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'day2-lessons.js'), 'utf8'), day2Context);
const algebraic = (file, rank) => ({ r: 8 - rank, c: 'abcdefgh'.indexOf(file) });
const originalLessons = Array.from({ length: 14 }, (_, index) => ({ id: `original-${index}`, title: `Lesson ${index}` }));
const lessons = day2Context.window.buildDay2Lessons(originalLessons, algebraic);
const lessonById = id => lessons.find(lesson => lesson.id === id);
const challengeBoard = challenge => [p(challenge.piece, 'white', challenge.start.r, challenge.start.c), ...challenge.friends, ...challenge.enemies];
let challengeCount = 0;
let goalCount = 0;
for (const lesson of lessons.filter(lesson => lesson.type === 'challenge')) {
  check(lesson.requiredCorrect, lesson.challenges.length, `${lesson.id} criterion covers every challenge`);
  for (let i = 0; i < lesson.challenges.length; i++) {
    const challenge = lesson.challenges[i];
    const board = challengeBoard(challenge);
    for (const goal of challenge.goals) {
      yes(has(R.legalDestinations(board, challenge.start), goal.r, goal.c), `${lesson.id} challenge ${i + 1}: explicit goal ${key(goal)} is legal`);
      const after = R.applyMove(board, challenge.start, goal);
      no(R.inCheck(after, 'white'), `${lesson.id} challenge ${i + 1}: explicit goal keeps white king safe`);
      goalCount++;
    }
    challengeCount++;
  }
}
check(challengeCount, 20, 'Day 2 contains 20 new move challenges');
check(goalCount, 22, 'all 22 explicit challenge goal alternatives tested');

const protection = lessonById('defend');
for (let i = 0; i < protection.challenges.length; i++) {
  const challenge = protection.challenges[i];
  const ally = challenge.friends.find(piece => piece.piece !== 'king');
  const attacker = challenge.enemies.find(piece => piece.piece !== 'king');
  const before = challengeBoard(challenge);
  yes(R.isAttacked(before, ally.at, 'black'), `protection ${i + 1}: the stated ally is actually threatened`);
  for (const goal of challenge.goals) {
    const defended = R.applyMove(before, challenge.start, goal);
    const defendingPiece = defended.find(piece => piece.side === 'white' && key(piece.at) === key(goal));
    yes(R.isAttacked([defendingPiece], ally.at, 'white'), `protection ${i + 1} at ${key(goal)}: moved piece directly controls ally square`);
    yes(has(R.legalDestinations(defended, attacker.at), ally.at.r, ally.at.c), `protection ${i + 1}: attacker can still capture ally, as explanation says`);
    const allyCaptured = R.applyMove(defended, attacker.at, ally.at);
    yes(has(R.legalDestinations(allyCaptured, goal), ally.at.r, ally.at.c), `protection ${i + 1} at ${key(goal)}: defender can legally recapture`);
  }
}

for (const id of ['block', 'take-checker']) {
  for (let i = 0; i < lessonById(id).challenges.length; i++) {
    const challenge = lessonById(id).challenges[i];
    const board = challengeBoard(challenge);
    yes(R.inCheck(board, 'white'), `${id} ${i + 1}: starts with real check`);
    const result = R.applyMove(board, challenge.start, challenge.goals[0]);
    no(R.inCheck(result, 'white'), `${id} ${i + 1}: intended response resolves check`);
    check(result.length, board.length - (id === 'take-checker' ? 1 : 0), `${id} ${i + 1}: correct capture or interposition effect`);
  }
}

const mateLesson = lessons.find(lesson => lesson.id === 'original-11');
const expectedMateStates = ['checkmate', 'playing', 'stalemate'];
mateLesson.questions.forEach((question, i) => {
  check(R.gameStatus(question.pieces, 'black').state, expectedMateStates[i], `mate quiz ${i + 1}: displayed position has expected status`);
  check(question.choices.filter(choice => choice.correct).length, 1, `mate quiz ${i + 1}: exactly one answer marked correct`);
  check(question.choices.findIndex(choice => choice.correct), i, `mate quiz ${i + 1}: correct answer corresponds to actual status`);
});

const miniSolutions = [
  { from: algebraic('a', 1), to: algebraic('h', 1) },
  { from: algebraic('h', 1), to: algebraic('a', 1) },
  { from: algebraic('a', 8), to: algebraic('h', 8) }
];
lessonById('mini').games.forEach((game, i) => {
  check(R.gameStatus(game.pieces, 'white').state, 'playing', `mini ${i + 1}: begins as a playable position`);
  no(R.inCheck(game.pieces, 'white'), `mini ${i + 1}: white starts safely`);
  no(R.inCheck(game.pieces, 'black'), `mini ${i + 1}: black is not already in check`);
  const solution = miniSolutions[i];
  yes(has(R.legalDestinations(game.pieces, solution.from), solution.to.r, solution.to.c), `mini ${i + 1}: hinted mate-in-one move is legal`);
  check(R.gameStatus(R.applyMove(game.pieces, solution.from, solution.to), 'black'), { state: 'checkmate', check: true, winner: 'white' }, `mini ${i + 1}: hinted move actually checkmates`);
  yes(R.legalMoves(game.pieces, 'white').some(move => R.gameStatus(R.applyMove(game.pieces, move.from, move.to), 'black').state === 'checkmate'), `mini ${i + 1}: at least one mate-in-one exists`);
});
const finalChallenge = lessonById('assessment').challenges[4];
check(R.gameStatus(R.applyMove(challengeBoard(finalChallenge), finalChallenge.start, finalChallenge.goals[0]), 'black').state, 'checkmate', 'assessment final goal is real checkmate');
check(R.applyMove(challengeBoard(lessonById('assessment').challenges[1]), lessonById('assessment').challenges[1].start, lessonById('assessment').challenges[1].goals[0])[0].piece, 'promoted', 'assessment promotion task actually promotes pawn');

// Extract lesson data and the coordinate formatter, not the application script.
// This evaluates no DOM handlers and requires no browser or additional packages.
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const lessonStart = indexSource.indexOf('var lessons = [');
const lessonEndMarker = '\n  ];';
const lessonEnd = indexSource.indexOf(lessonEndMarker, lessonStart);
yes(lessonStart >= 0 && lessonEnd > lessonStart, 'inline lesson data has expected portable extraction boundaries');
const inlineContext = { pos: algebraic };
const inlineLessons = vm.runInNewContext(indexSource.slice(lessonStart, lessonEnd + lessonEndMarker.length) + '\nlessons;', inlineContext);
no(Object.hasOwn(inlineContext, 'document'), 'lesson data evaluates without a DOM');
no(Object.hasOwn(inlineContext, 'window'), 'lesson data evaluates without browser side effects');
const coordinateLesson = inlineLessons[0];
check(coordinateLesson.coordinateLesson, true, 'first lesson is the coordinate lesson');
check(coordinateLesson.type, 'quiz', 'coordinate lesson uses answer choices');
check(coordinateLesson.requiredCorrect, 5, 'coordinate lesson requires five correct answers');
check(coordinateLesson.questions.length, 5, 'coordinate lesson contains five questions');
check(new Set(coordinateLesson.questions.map(question => key(question.target))).size, 5, 'coordinate questions target five distinct squares');
check(key(coordinateLesson.questions[0].target), key(algebraic('f', 8)), 'first target is f8 / ฉ8');

const displayDeclaration = indexSource.match(/var displayFiles = (\[[^\]]+\]);/);
const formatterDeclaration = indexSource.match(/function squareLabel\(p\)\{[^}]+\}/);
yes(displayDeclaration && formatterDeclaration, 'actual Thai file mapping and square formatter can be extracted');
const actualDisplayFiles = vm.runInNewContext(displayDeclaration[1]);
const expectedThaiFiles = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ญ'];
check(Array.from(actualDisplayFiles), expectedThaiFiles, 'actual horizontal board labels use requested Thai characters');
const actualSquareLabel = vm.runInNewContext(formatterDeclaration[0] + '\nsquareLabel;', { displayFiles: actualDisplayFiles });
const allLabels = [];
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const label = actualSquareLabel({ r, c });
    check(label, expectedThaiFiles[c] + (8 - r), `actual board formatter labels square row ${r}, column ${c}`);
    allLabels.push(label);
  }
}
check(allLabels.length, 64, 'coordinate introduction can generate all 64 labels');
check(new Set(allLabels).size, 64, 'every generated square label is unique');
check(actualSquareLabel({ r: 7, c: 0 }), 'ก1', 'lower-left corner is ก1');
check(actualSquareLabel({ r: 0, c: 7 }), 'ญ8', 'upper-right corner is ญ8');
const validCoordinateLabels = new Set(allLabels);
coordinateLesson.questions.forEach((question, index) => {
  const target = question.target;
  yes(Number.isInteger(target.r) && Number.isInteger(target.c) && target.r >= 0 && target.r < 8 && target.c >= 0 && target.c < 8, `coordinate question ${index + 1}: target is on board`);
  check(question.pieces.length, 0, `coordinate question ${index + 1}: labels are taught without distracting pieces`);
  check(question.choices.length, 3, `coordinate question ${index + 1}: has three choices`);
  check(new Set(question.choices.map(choice => choice.text)).size, 3, `coordinate question ${index + 1}: choices have unique labels`);
  const correctChoices = question.choices.filter(choice => choice.correct);
  check(correctChoices.length, 1, `coordinate question ${index + 1}: exactly one answer is marked correct`);
  check(correctChoices[0].text, expectedThaiFiles[target.c] + (8 - target.r), `coordinate question ${index + 1}: correct answer matches Thai file and rank`);
  question.choices.forEach(choice => yes(validCoordinateLabels.has(choice.text), `coordinate question ${index + 1}: choice ${choice.text} is a valid square label`));
});
console.log(`Makruk rules and lesson content verified: ${assertions} assertions passed; ${challengeCount} Day 2 challenges / ${goalCount} goal alternatives / ${coordinateLesson.questions.length} coordinate questions.`);
