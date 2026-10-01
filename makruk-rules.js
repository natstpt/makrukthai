/* Makruk movement and king safety for beginner practice.
 * Board coordinates: row 0 is rank 8; White advances toward smaller rows.
 * Tournament counting rules are deliberately handled outside this module.
 */
(function (root, factory) {
  'use strict';
  var rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  if (root) root.MakrukRules = rules;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var orthogonal = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var diagonal = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var knightSteps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

  function inside(at) {
    return at && Number.isInteger(at.r) && Number.isInteger(at.c) &&
      at.r >= 0 && at.r < 8 && at.c >= 0 && at.c < 8;
  }

  function same(a, b) {
    return a && b && a.r === b.r && a.c === b.c;
  }

  function opponent(side) {
    return side === 'white' ? 'black' : 'white';
  }

  function pieceAt(pieces, at) {
    return pieces.find(function (piece) { return same(piece.at, at); });
  }

  function clonePieces(pieces) {
    return pieces.map(function (piece) {
      return Object.assign({}, piece, { at: { r: piece.at.r, c: piece.at.c } });
    });
  }

  function pseudoDestinations(pieces, from) {
    if (!inside(from)) return [];
    var moving = pieceAt(pieces, from);
    if (!moving) return [];
    var destinations = [];
    var forward = moving.side === 'white' ? -1 : 1;

    function add(at, captureOnly, emptyOnly) {
      if (!inside(at)) return;
      var occupant = pieceAt(pieces, at);
      if (occupant && (occupant.side === moving.side || occupant.piece === 'king')) return;
      if (captureOnly && !occupant) return;
      if (emptyOnly && occupant) return;
      destinations.push(at);
    }

    if (moving.piece === 'pawn') {
      add({ r: from.r + forward, c: from.c }, false, true);
      add({ r: from.r + forward, c: from.c - 1 }, true, false);
      add({ r: from.r + forward, c: from.c + 1 }, true, false);
      return destinations;
    }

    if (moving.piece === 'rook') {
      orthogonal.forEach(function (step) {
        for (var distance = 1; distance < 8; distance++) {
          var at = { r: from.r + step[0] * distance, c: from.c + step[1] * distance };
          if (!inside(at)) break;
          add(at, false, false);
          if (pieceAt(pieces, at)) break;
        }
      });
      return destinations;
    }

    var steps = moving.piece === 'king' ? orthogonal.concat(diagonal) :
      moving.piece === 'knight' ? knightSteps :
      moving.piece === 'met' || moving.piece === 'promoted' ? diagonal :
      moving.piece === 'khon' ? diagonal.concat([[forward, 0]]) : [];
    steps.forEach(function (step) {
      add({ r: from.r + step[0], c: from.c + step[1] }, false, false);
    });
    return destinations;
  }

  function isAttacked(pieces, at, bySide) {
    if (!inside(at)) return false;
    return pieces.some(function (piece) {
      if (piece.side !== bySide) return false;
      var dr = at.r - piece.at.r;
      var dc = at.c - piece.at.c;
      var ar = Math.abs(dr);
      var ac = Math.abs(dc);
      var forward = piece.side === 'white' ? -1 : 1;
      if (piece.piece === 'pawn') return dr === forward && ac === 1;
      if (piece.piece === 'king') return Math.max(ar, ac) === 1;
      if (piece.piece === 'knight') return (ar === 1 && ac === 2) || (ar === 2 && ac === 1);
      if (piece.piece === 'met' || piece.piece === 'promoted') return ar === 1 && ac === 1;
      if (piece.piece === 'khon') return (ar === 1 && ac === 1) || (dr === forward && dc === 0);
      if (piece.piece !== 'rook' || (dr === 0 && dc === 0) || (dr !== 0 && dc !== 0)) return false;
      var stepR = Math.sign(dr);
      var stepC = Math.sign(dc);
      for (var distance = 1; distance < Math.max(ar, ac); distance++) {
        if (pieceAt(pieces, { r: piece.at.r + distance * stepR, c: piece.at.c + distance * stepC })) return false;
      }
      return true;
    });
  }

  function inCheck(pieces, side) {
    var king = pieces.find(function (piece) { return piece.side === side && piece.piece === 'king'; });
    return !!king && isAttacked(pieces, king.at, opponent(side));
  }

  function relocate(pieces, from, to) {
    var result = clonePieces(pieces);
    var moving = pieceAt(result, from);
    if (!moving) return result;
    result = result.filter(function (piece) { return piece === moving || !same(piece.at, to); });
    moving.at = { r: to.r, c: to.c };
    if (moving.piece === 'pawn' && ((moving.side === 'white' && to.r <= 2) ||
      (moving.side === 'black' && to.r >= 5))) moving.piece = 'promoted';
    return result;
  }

  function legalDestinations(pieces, from) {
    var moving = pieceAt(pieces, from);
    if (!moving) return [];
    return pseudoDestinations(pieces, from).filter(function (to) {
      return !inCheck(relocate(pieces, from, to), moving.side);
    });
  }

  function legalMoves(pieces, side) {
    var moves = [];
    pieces.forEach(function (piece) {
      if (piece.side !== side) return;
      legalDestinations(pieces, piece.at).forEach(function (to) {
        moves.push({ from: { r: piece.at.r, c: piece.at.c }, to: to });
      });
    });
    return moves;
  }

  function applyMove(pieces, from, to) {
    if (!legalDestinations(pieces, from).some(function (at) { return same(at, to); })) return clonePieces(pieces);
    return relocate(pieces, from, to);
  }

  function gameStatus(pieces, sideToMove) {
    var check = inCheck(pieces, sideToMove);
    if (!legalMoves(pieces, sideToMove).length) {
      return { state: check ? 'checkmate' : 'stalemate', check: check, winner: check ? opponent(sideToMove) : null };
    }
    var bareKings = pieces.length === 2 && pieces.every(function (piece) { return piece.piece === 'king'; }) &&
      pieces.some(function (piece) { return piece.side === 'white'; }) &&
      pieces.some(function (piece) { return piece.side === 'black'; });
    if (bareKings && !inCheck(pieces, 'white') && !inCheck(pieces, 'black')) {
      return { state: 'draw', check: false, winner: null };
    }
    return { state: 'playing', check: check, winner: null };
  }

  return {
    clonePieces: clonePieces,
    pseudoDestinations: pseudoDestinations,
    legalDestinations: legalDestinations,
    legalMoves: legalMoves,
    applyMove: applyMove,
    isAttacked: isAttacked,
    inCheck: inCheck,
    gameStatus: gameStatus
  };
});
