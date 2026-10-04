'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const N = require('../makruk-notation.js');
const R = require('../makruk-rules.js');
let assertions = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
const yes = (actual, label) => check(!!actual, true, label);
const no = (actual, label) => check(!!actual, false, label);
const pos = (file, rank) => ({ r: 8 - rank, c: 'abcdefgh'.indexOf(file) });
const p = (piece, side, file, rank) => ({ piece, side, at: pos(file, rank) });

check(N.abbreviations, { king: 'ข', rook: 'ร', knight: 'ม', khon: 'ค', met: 'ม็', pawn: 'บ', promoted: 'ง' }, 'all seven official Thai abbreviations');
check(N.englishAbbreviations, { king: 'K', rook: 'R', knight: 'M', khon: 'H', met: 'D', pawn: 'B', promoted: 'N' }, 'official English mapping differs from chess SVG letters');
check(N.squareLabel(pos('a', 1)), 'ก1', 'Thai lower-left square');
check(N.squareLabel(pos('h', 8)), 'ญ8', 'Thai upper-right square');
check(N.squareLabel({ r: 8, c: 1 }), '', 'offboard label rejected');

for (const [type, destination] of [['king', ['e', 4]], ['rook', ['d', 7]], ['knight', ['f', 5]], ['khon', ['e', 5]], ['met', ['c', 5]], ['pawn', ['d', 5]], ['promoted', ['e', 3]]]) {
  const board = [p(type, 'white', 'd', 4)];
  const snapshot = JSON.stringify(board);
  const from = pos('d', 4);
  const to = pos(...destination);
  const record = N.formatMove(board, from, to);
  check(record.text, `${N.abbreviations[type]}.ง4 - ${N.squareLabel(to)}`, `${type} quiet notation`);
  check(record.piece, type, `${type} retains internal piece type`);
  check(record.capture, null, `${type} no captured piece`);
  no(record.check || record.mate || record.promotion, `${type} isolated quiet move has no false terminal markers`);
  check(JSON.stringify(board), snapshot, `${type} formatter does not mutate board`);
  check(from, pos('d', 4), `${type} formatter does not mutate origin`);
  check(to, pos(...destination), `${type} formatter does not mutate destination`);
  yes(N.matchesNotation(record.text, record), `${type} accepts own canonical output`);
  const english = `${N.englishAbbreviations[type]}d4-${destination[0]}${destination[1]}`;
  yes(N.matchesNotation(english, record), `${type} accepts official English abbreviations and files`);
}

const knightBoard = [p('knight', 'white', 'b', 1)];
const knight = N.formatMove(knightBoard, pos('b', 1), pos('d', 2));
check(knight.text, 'ม.ข1 - ง2', 'legal introductory knight example');
yes(N.matchesNotation(' ม . ข ๑ — ง ๒ ', knight), 'Thai digits, spaces, dots, em dash accepted');
yes(N.matchesNotation('มข1→ง2', knight), 'arrow quiet separator accepted');
yes(N.matchesNotation('ม.ข1 -> ง2', knight), 'ASCII arrow quiet separator accepted');
yes(N.matchesNotation('M.b1 - d2', knight), 'official English knight M accepted');
no(N.matchesNotation('N.b1 - d2', knight), 'international chess knight N is not official Makruk M');
no(N.matchesNotation('มข1Xง2', knight), 'quiet cannot be recorded as capture');
no(N.matchesNotation('มข1-ง2+', knight), 'false check marker rejected');
no(N.matchesNotation('มข1-ง2#', knight), 'false mate marker rejected');
no(N.matchesNotation('มข1-มง2', knight), 'quiet move cannot include captured type');
no(N.matchesNotation('มข1-ฉ3', knight), 'wrong destination rejected');
no(N.matchesNotation('มช1-ง2', knight), 'wrong origin rejected');
no(N.matchesNotation('คข1-ง2', knight), 'wrong moving piece rejected');
no(N.matchesNotation('ง2', knight), 'beginner full-origin task does not accept short notation');
check(N.formatMove(knightBoard, pos('b', 1), pos('f', 3)), null, 'illegal user example b1-f3 never formatted as legal knight move');
check(N.formatMove(knightBoard, pos('b', 2), pos('d', 3)), null, 'missing source rejected');
check(N.formatMove(knightBoard, { r: -1, c: 1 }, pos('d', 3)), null, 'offboard source rejected');

for (const target of Object.keys(N.abbreviations).filter(type => type !== 'king')) {
  const board = [p('rook', 'white', 'a', 4), p(target, 'black', 'd', 4)];
  const snapshot = JSON.stringify(board);
  const record = N.formatMove(board, pos('a', 4), pos('d', 4));
  check(record.text, `ร.ก4 × ${N.abbreviations[target]}.ง4`, `${target} captured abbreviation`);
  check(record.capture, target, `${target} capture type retained`);
  yes(N.matchesNotation(record.text, record), `${target} canonical capture accepted`);
  yes(N.matchesNotation('ร.ก4 x ง4', record), `${target} destination-only capture accepted`);
  yes(N.matchesNotation('ร.ก๔ × ง๔', record), `${target} multiplication mark and Thai digits accepted`);
  no(N.matchesNotation('ร.ก4 - ง4', record), `${target} missing capture marker rejected`);
  no(N.matchesNotation('ร.ก4 × ข.ง4', record), `${target} wrong captured type rejected`);
  check(JSON.stringify(board), snapshot, `${target} capture formatter does not mutate board`);
}

const checkBoard = [p('king', 'white', 'a', 1), p('rook', 'white', 'a', 4), p('king', 'black', 'h', 8)];
const checking = N.formatMove(checkBoard, pos('a', 4), pos('h', 4));
check(checking.text, 'ร.ก4 - ญ4+', 'ordinary check has +');
yes(checking.check, 'check flag true');
no(checking.mate, 'not every check is mate');
yes(N.matchesNotation('ร.ก4 - ญ4+', checking), 'correct check notation accepted');
no(N.matchesNotation('ร.ก4 - ญ4', checking), 'missing required check marker rejected');
no(N.matchesNotation('ร.ก4 - ญ4#', checking), 'mate marker cannot replace ordinary check');

const mateBoard = [p('king', 'white', 'f', 7), p('rook', 'white', 'a', 1), p('king', 'black', 'h', 8)];
const mating = N.formatMove(mateBoard, pos('a', 1), pos('h', 1));
check(mating.text, 'ร.ก1 - ญ1#', 'mate has #');
yes(mating.check && mating.mate, 'mate also reports check');
yes(N.matchesNotation('ร.ก1 - ญ1#', mating), 'hash mate accepted');
yes(N.matchesNotation('ร.ก๑ — ญ๑++', mating), 'official double-plus mate equivalent accepted');
no(N.matchesNotation('ร.ก1 - ญ1+', mating), 'ordinary check cannot replace mate');
no(N.matchesNotation('ร.ก1 - ญ1', mating), 'missing mate marker rejected');

const captureCheckBoard = [p('king', 'white', 'a', 1), p('rook', 'white', 'a', 4), p('pawn', 'black', 'h', 4), p('king', 'black', 'h', 8)];
const capturingCheck = N.formatMove(captureCheckBoard, pos('a', 4), pos('h', 4));
check(capturingCheck.text, 'ร.ก4 × บ.ญ4+', 'capture and check combined');
yes(N.matchesNotation('ร.ก4 × ญ4+', capturingCheck), 'capture-check optional target type accepted');
no(N.matchesNotation('ร.ก4 × บ.ญ4', capturingCheck), 'capture does not waive check marker requirement');

for (const [side, start, end] of [['white', ['d', 5], ['d', 6]], ['black', ['e', 4], ['e', 3]]]) {
  const board = [p('pawn', side, ...start)];
  const snapshot = JSON.stringify(board);
  const record = N.formatMove(board, pos(...start), pos(...end));
  check(record.piece, 'pawn', `${side} promotion records original pawn type`);
  check(record.abbreviation, 'บ', `${side} promotion does not retrospectively change moving abbreviation`);
  yes(record.promotion, `${side} promotion flag`);
  check(record.promotionNote, `เบี้ยหงายที่ ${N.squareLabel(pos(...end))} ต่อไปใช้อักษรย่อ ง`, `${side} promotion separate note`);
  no(record.text.includes('='), `${side} no unsupported promotion symbol`);
  yes(N.matchesNotation(record.text, record), `${side} pawn promotion notation accepted`);
  no(N.matchesNotation(record.text.replace(/^บ/, 'ง'), record), `${side} promoted abbreviation is not used prematurely`);
  check(JSON.stringify(board), snapshot, `${side} promotion does not mutate original`);
  const promoted = R.applyMove(board, pos(...start), pos(...end));
  const following = N.formatMove(promoted, pos(...end), { r: pos(...end).r + (side === 'white' ? -1 : 1), c: pos(...end).c + 1 });
  check(following.abbreviation, 'ง', `${side} next move uses promoted abbreviation`);
}

no(N.matchesNotation('', knight), 'empty answer rejected');
no(N.matchesNotation(null, knight), 'non-string answer rejected');
no(N.matchesNotation(knight.text, null), 'missing record rejected');
const browser = { MakrukRules: R };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../makruk-notation.js'), 'utf8'), { window: browser });
check(browser.MakrukNotation.formatMove(knightBoard, pos('b', 1), pos('d', 2)).text, knight.text, 'browser UMD exports functional module');
yes(browser.MakrukNotation.matchesNotation('มข๑-ง๒', knight), 'browser matcher agrees with CommonJS');
console.log(`Makruk notation verified: ${assertions} assertions passed.`);

