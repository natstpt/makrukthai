/* Beginner full-origin Makruk notation, following Appendix C 1.2–1.5
 * of the Thai Traditional Sports Association's 2569 rules.
 * The dot separates the piece abbreviation from the square for readability.
 * Promotion is explained separately; the rules do not prescribe an '=' marker.
 */
(function (root, factory) {
  'use strict';
  var rules = typeof module === 'object' && module.exports ? require('./makruk-rules.js') : root && root.MakrukRules;
  var notation = factory(rules);
  if (typeof module === 'object' && module.exports) module.exports = notation;
  if (root) root.MakrukNotation = notation;
})(typeof window !== 'undefined' ? window : null, function (Rules) {
  'use strict';

  var abbreviations = Object.freeze({ king: 'ข', rook: 'ร', knight: 'ม', khon: 'ค', met: 'ม็', pawn: 'บ', promoted: 'ง' });
  var englishAbbreviations = Object.freeze({ king: 'K', rook: 'R', knight: 'M', khon: 'H', met: 'D', pawn: 'B', promoted: 'N' });
  var files = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ญ'];

  function same(a, b) { return a && b && a.r === b.r && a.c === b.c; }
  function inside(at) {
    return !!at && Number.isInteger(at.r) && Number.isInteger(at.c) && at.r >= 0 && at.r < 8 && at.c >= 0 && at.c < 8;
  }
  function squareLabel(at) { return inside(at) ? files[at.c] + (8 - at.r) : ''; }
  function pieceAt(pieces, at) { return pieces.find(function (piece) { return same(piece.at, at); }); }

  function formatMove(pieces, from, to) {
    if (!Rules || !Array.isArray(pieces) || !inside(from) || !inside(to)) return null;
    var moving = pieceAt(pieces, from);
    if (!moving || !abbreviations[moving.piece] || !Rules.legalDestinations(pieces, from).some(function (at) { return same(at, to); })) return null;
    var captured = pieceAt(pieces, to);
    var after = Rules.applyMove(pieces, from, to);
    var opponent = moving.side === 'white' ? 'black' : 'white';
    // Isolated movement lessons may have no opposing king; these are not mates.
    var hasEnemyKing = after.some(function (piece) { return piece.side === opponent && piece.piece === 'king'; });
    var status = hasEnemyKing ? Rules.gameStatus(after, opponent) : { check: false, state: 'playing' };
    var check = !!status.check;
    var mate = status.state === 'checkmate';
    var arrived = pieceAt(after, to);
    var promotion = moving.piece === 'pawn' && arrived && arrived.piece === 'promoted';
    var origin = squareLabel(from);
    var destination = squareLabel(to);
    var suffix = mate ? '#' : check ? '+' : '';
    return {
      text: abbreviations[moving.piece] + '.' + origin + (captured ? ' X ' + abbreviations[captured.piece] + '.' : ' - ') + destination + suffix,
      piece: moving.piece,
      abbreviation: abbreviations[moving.piece],
      side: moving.side,
      from: origin,
      to: destination,
      fromAt: { r: from.r, c: from.c },
      toAt: { r: to.r, c: to.c },
      capture: captured ? captured.piece : null,
      check: check,
      mate: mate,
      promotion: !!promotion,
      promotionNote: promotion ? 'เบี้ยหงายที่ ' + destination + ' ต่อไปใช้อักษรย่อ ง' : '',
      suffix: suffix
    };
  }

  function normalizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.normalize('NFC')
      .replace(/[๐-๙]/g, function (digit) { return String(digit.charCodeAt(0) - 0x0e50); })
      .replace(/\s|\./g, '')
      .replace(/->|[–—−→➝]/g, '-')
      .replace(/[x×]/g, 'X')
      .replace(/\+\+$/, '#')
      .toUpperCase();
  }

  function typeFromAbbreviation(value) {
    return Object.keys(abbreviations).find(function (piece) {
      return abbreviations[piece] === value || englishAbbreviations[piece] === value;
    }) || null;
  }
  function normalizedSquare(value) {
    var file = value.charAt(0);
    var index = files.indexOf(file);
    if (index === -1) index = 'ABCDEFGH'.indexOf(file);
    return index === -1 ? '' : files[index] + value.charAt(1);
  }

  function matchesNotation(input, record) {
    if (!record || !record.piece || !record.from || !record.to) return false;
    // Full-origin notation is deliberate: learners must identify both squares.
    var parsed = normalizeInput(input).match(/^(ม็|ข|ร|ม|ค|บ|ง|K|R|M|H|D|B|N)([กขคงจฉชญA-H][1-8])([-X])(?:(ม็|ข|ร|ม|ค|บ|ง|K|R|M|H|D|B|N))?([กขคงจฉชญA-H][1-8])([+#]?)$/);
    if (!parsed) return false;
    if (typeFromAbbreviation(parsed[1]) !== record.piece || normalizedSquare(parsed[2]) !== record.from || normalizedSquare(parsed[5]) !== record.to) return false;
    if ((parsed[3] === 'X') !== !!record.capture) return false;
    // Captured piece is optional, but when supplied it must be the right piece.
    if (parsed[4] && (!record.capture || typeFromAbbreviation(parsed[4]) !== record.capture)) return false;
    var requiredSuffix = record.mate ? '#' : record.check ? '+' : '';
    return parsed[6] === requiredSuffix;
  }

  return {
    abbreviations: abbreviations,
    englishAbbreviations: englishAbbreviations,
    squareLabel: squareLabel,
    formatMove: formatMove,
    matchesNotation: matchesNotation
  };
});
