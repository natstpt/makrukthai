'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Rules = require('../makruk-rules.js');
const Notation = require('../makruk-notation.js');
let assertions = 0;
const check = (actual, expected, label) => {
  // Factory data comes from a browser-style VM realm; compare values, not prototypes.
  const plain = value => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  assert.deepEqual(plain(actual), plain(expected), label);
  assertions++;
};
const yes = (actual, label) => check(!!actual, true, label);
const no = (actual, label) => check(!!actual, false, label);
const pos = (file, rank) => ({ r: 8 - rank, c: 'abcdefgh'.indexOf(file) });
const same = (a, b) => !!a && !!b && a.r === b.r && a.c === b.c;
const squareKey = at => `${at.r},${at.c}`;
const onBoard = at => !!at && Number.isInteger(at.r) && Number.isInteger(at.c) && at.r >= 0 && at.r < 8 && at.c >= 0 && at.c < 8;
const repo = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

// Evaluate the actual initial lesson data and the actual factory calls, not the
// application IIFE. There is no DOM, browser, server, or third-party dependency.
const start = source.indexOf('var lessons = [');
const end = source.indexOf('// Keep internal coordinates stable', start);
yes(start >= 0 && end > start, 'lesson data and factory calls have portable extraction boundaries');
const context = { window: {}, pos };
vm.createContext(context);
for (const filename of ['day2-lessons.js', 'rules-lessons.js', 'learning-design.js']) {
  vm.runInContext(fs.readFileSync(path.join(repo, filename), 'utf8'), context, { filename });
}
const lessons = vm.runInContext(source.slice(start, end) + '\nlessons;', context, { filename: 'inline-curriculum-data' });
no(Object.hasOwn(context, 'document'), 'actual curriculum loads without a DOM');
no(Object.hasOwn(context, 'localStorage'), 'curriculum data evaluation has no progress side effects');
const expectedIds = [
  'board', 'king', 'rook', 'knight', 'met', 'khon', 'pawn', 'promotion', 'promoted', 'setup',
  'capture', 'check', 'escape', 'mate', 'review', 'defend', 'block', 'take-checker', 'notation', 'draw-rules',
  'think', 'fair-play', 'game', 'mini', 'assessment', 'finish'
];
check(Array.from(lessons, lesson => lesson.id), expectedIds, 'final 26 stable IDs appear in intended teaching order');
check(lessons.length, 26, 'final curriculum has 26 lessons');
check(new Set(lessons.map(lesson => lesson.id)).size, 26, 'all stable IDs are unique');
check(lessons.filter(lesson => lesson.day === 1).length, 14, 'Day 1 has 14 foundational lessons');
check(lessons.filter(lesson => lesson.day === 2).length, 12, 'Day 2 has 12 extension lessons');
check(lessons.findIndex(lesson => lesson.day === 2), 14, 'Day 2 begins after all fundamentals');
yes(lessons.slice(0, 14).every(lesson => lesson.day === 1), 'Day 1 lessons form one contiguous section');
yes(lessons.slice(14).every(lesson => lesson.day === 2), 'Day 2 lessons form one contiguous section');
check(lessons.findIndex(lesson => lesson.id === 'setup'), 9, 'full setup board is lesson 10 after piece-by-piece learning');
const byId = id => lessons.find(lesson => lesson.id === id);

// The supplied 2569 source has 36 PDF pages. Each source note must point inside
// that edition and contain both a short teaching summary and a clause reference.
for (const lesson of lessons) {
  yes(Array.isArray(lesson.sourceNotes) && lesson.sourceNotes.length > 0, `${lesson.id}: at least one source note`);
  for (const [i, note] of lesson.sourceNotes.entries()) {
    yes(typeof note.text === 'string' && note.text.trim().length > 0, `${lesson.id} note ${i + 1}: nonempty teaching summary`);
    yes(Number.isInteger(note.page) && note.page >= 1 && note.page <= 36, `${lesson.id} note ${i + 1}: valid page in the 36-page source`);
    yes(typeof note.clause === 'string' && note.clause.trim().length > 0, `${lesson.id} note ${i + 1}: human-readable clause`);
  }
}

const setup = byId('setup');
check(setup.type, 'quiz', 'setup uses short questions');
check(setup.day, 1, 'setup belongs to Day 1 after the piece introductions');
check(setup.requiredCorrect, 3, 'setup requires three correct answers');
check(setup.questions.length, 3, 'setup contains three questions');
const expectedCounts = { king: 1, rook: 2, knight: 2, khon: 2, met: 1, pawn: 8 };
const whiteBack = ['rook', 'knight', 'khon', 'king', 'met', 'khon', 'knight', 'rook'];
const redBack = ['rook', 'knight', 'khon', 'met', 'king', 'khon', 'knight', 'rook'];
for (const [i, question] of setup.questions.entries()) {
  const board = question.pieces;
  check(board.length, 32, `setup question ${i + 1}: displays all 32 pieces`);
  check(new Set(board.map(piece => squareKey(piece.at))).size, 32, `setup question ${i + 1}: no overlapping pieces`);
  yes(board.every(piece => onBoard(piece.at)), `setup question ${i + 1}: all pieces are on the board`);
  for (const side of ['white', 'black']) {
    const sidePieces = board.filter(piece => piece.side === side);
    check(sidePieces.length, 16, `setup question ${i + 1}: ${side} has 16 pieces`);
    for (const [piece, count] of Object.entries(expectedCounts)) {
      check(sidePieces.filter(item => item.piece === piece).length, count, `setup question ${i + 1}: ${side} ${piece} count`);
    }
    const kingSquare = side === 'white' ? pos('d', 1) : pos('e', 8);
    yes(sidePieces.some(piece => piece.piece === 'king' && same(piece.at, kingSquare)), `setup question ${i + 1}: ${side} king at official starting square`);
    const pawnRow = side === 'white' ? 5 : 2;
    yes(sidePieces.filter(piece => piece.piece === 'pawn').every(piece => piece.at.r === pawnRow), `setup question ${i + 1}: ${side} pawns on official starting rank`);
    no(Rules.inCheck(board, side), `setup question ${i + 1}: ${side} king is initially safe`);
  }
  for (let c = 0; c < 8; c++) {
    const white = board.find(piece => piece.side === 'white' && piece.at.r === 7 && piece.at.c === c);
    const red = board.find(piece => piece.side === 'black' && piece.at.r === 0 && piece.at.c === c);
    check(white && white.piece, whiteBack[c], `setup question ${i + 1}: white back-rank file ${c}`);
    check(red && red.piece, redBack[c], `setup question ${i + 1}: opposing back-rank file ${c}`);
  }
}

const notation = byId('notation');
check(notation.type, 'notation', 'notation uses move-then-write practice');
check(notation.day, 2, 'notation follows the check and checkmate lessons on Day 2');
check(notation.requiredCorrect, 6, 'notation requires six correct written moves');
check(notation.challenges.length, 6, 'notation has six different move scenarios');
check(Array.from(notation.challenges, task => task.expectedNotation), ['มข1-ง2', 'รก4-ง4', 'บง5-ง6', 'รก4Xง4', 'รก1-ญ1#', 'รก4-ญ4+'], 'expected full-origin Thai records cover all six scenarios');
const expectedEffects = [
  { capture: null, check: false, mate: false, promotion: false },
  { capture: null, check: false, mate: false, promotion: false },
  { capture: null, check: false, mate: false, promotion: true },
  { capture: 'pawn', check: false, mate: false, promotion: false },
  { capture: null, check: true, mate: true, promotion: false },
  { capture: null, check: true, mate: false, promotion: false }
];
for (const [i, task] of notation.challenges.entries()) {
  const board = [{ piece: task.piece || notation.piece, side: 'white', at: task.start }].concat(task.friends || [], task.enemies || []);
  const snapshot = JSON.stringify(board);
  yes(onBoard(task.start), `notation ${i + 1}: valid starting square`);
  check(task.goals.length, 1, `notation ${i + 1}: one clear goal`);
  yes(typeof task.mission === 'string' && task.mission.length > 0, `notation ${i + 1}: clear move-then-write instruction`);
  yes(typeof task.hint === 'string' && task.hint.length > 0, `notation ${i + 1}: helpful notation hint`);
  for (const goal of task.goals) {
    yes(onBoard(goal), `notation ${i + 1}: goal is on the board`);
    yes(Rules.legalDestinations(board, task.start).some(at => same(at, goal)), `notation ${i + 1}: intended move is legal`);
    const record = Notation.formatMove(board, task.start, goal);
    yes(record, `notation ${i + 1}: formatter produces a valid record`);
    yes(Notation.matchesNotation(task.expectedNotation, record), `notation ${i + 1}: expectedNotation matches actual formatter result`);
    yes(Notation.matchesNotation(record.text, record), `notation ${i + 1}: formatter's displayed text is accepted`);
    check({ capture: record.capture, check: record.check, mate: record.mate, promotion: record.promotion }, expectedEffects[i], `notation ${i + 1}: actual board effects match the teaching point`);
    no(Rules.inCheck(Rules.applyMove(board, task.start, goal), 'white'), `notation ${i + 1}: move keeps learner's king safe`);
  }
  check(JSON.stringify(board), snapshot, `notation ${i + 1}: verification does not mutate lesson position`);
}
check(Notation.formatMove([{ piece: 'knight', side: 'white', at: pos('b', 1) }], pos('b', 1), pos('f', 3)), null, 'incorrect b1-f3 example is not taught as a legal knight move');

const block = byId('block');
check(block.challenges.length, 3, 'block lesson offers three piece types');
for (const [i, task] of block.challenges.entries()) {
  const board = [{ piece: task.piece, side: 'white', at: task.start }].concat(task.friends || [], task.enemies || []);
  const king = board.find(piece => piece.side === 'white' && piece.piece === 'king');
  const target = task.goals[0];
  const replies = board.filter(piece => piece.side === 'white').flatMap(piece => Rules.legalDestinations(board, piece.at).map(at => ({ from: piece.at, to: at })));
  yes(Rules.inCheck(board, 'white'), `block ${i + 1}: white king starts in check`);
  check(Rules.legalDestinations(board, king.at).length, 0, `block ${i + 1}: king cannot escape the check`);
  check(replies.length, 1, `block ${i + 1}: only one legal response is available`);
  yes(same(replies[0].to, target), `block ${i + 1}: the only legal response blocks the rook`);
  no(Rules.inCheck(Rules.applyMove(board, task.start, target), 'white'), `block ${i + 1}: blocking move makes the king safe`);
}

for (const [id, count, day] of [['setup', 3, 1], ['draw-rules', 4, 2], ['fair-play', 3, 2]]) {
  const lesson = byId(id);
  check(lesson.type, 'quiz', `${id}: quiz type`);
  check(lesson.day, day, `${id}: correct teaching day`);
  check(lesson.requiredCorrect, count, `${id}: quota matches all situations`);
  check(lesson.questions.length, count, `${id}: expected question count`);
  for (const [i, question] of lesson.questions.entries()) {
    check(question.choices.length, 3, `${id} question ${i + 1}: three short answer choices`);
    check(new Set(question.choices.map(choice => choice.text)).size, 3, `${id} question ${i + 1}: distinct choices`);
    check(question.choices.filter(choice => choice.correct).length, 1, `${id} question ${i + 1}: exactly one correct answer`);
    yes(typeof question.mission === 'string' && question.mission.length > 0, `${id} question ${i + 1}: has a question`);
    yes(typeof question.hint === 'string' && question.hint.length > 0, `${id} question ${i + 1}: has a hint`);
    yes(typeof question.explanation === 'string' && question.explanation.length > 0, `${id} question ${i + 1}: has a learning explanation`);
    yes(Array.isArray(question.pieces), `${id} question ${i + 1}: explicit board diagram`);
    yes(question.pieces.every(piece => onBoard(piece.at)), `${id} question ${i + 1}: diagram squares are on board`);
    check(new Set(question.pieces.map(piece => squareKey(piece.at))).size, question.pieces.length, `${id} question ${i + 1}: no diagram overlap`);
  }
}
const draw = byId('draw-rules');
check(Rules.gameStatus(draw.questions[1].pieces, 'black').state, 'stalemate', 'Day 2 stalemate diagram really has no legal red move and no check');
check(Array.from(draw.questions, question => question.choices.findIndex(choice => choice.correct)), [0, 0, 0, 0], 'beginner draw questions teach no winner, stalemate, agreement and asking the teacher');
yes(draw.sourceNotes.some(note => note.text.includes('ศักดิ์หมาก')), 'advanced draw-counting details remain available in teacher notes');

for (const lesson of lessons) {
  yes(lesson.teachingSteps.length >= 2, `${lesson.id}: introduction then explanation precedes practice`);
  yes(lesson.teachingSteps.every(text => typeof text === 'string' && text.length < 110), `${lesson.id}: child-sized teaching sentences`);
}
for (const [i, question] of byId('mate').questions.entries()) {
  check(question.choices.length, 2, `Day 1 mate ${i + 1}: only mate versus escape, no advanced stalemate choice`);
  const status = Rules.gameStatus(question.pieces, 'black');
  check(status.state, i === 1 ? 'playing' : 'checkmate', `Day 1 mate ${i + 1}: diagram matches the answer`);
}
console.log(`Rules curriculum verified: ${assertions} assertions passed; 26 lessons / Day 1: 14 / Day 2: 12.`);

