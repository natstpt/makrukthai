'use strict';
const assert = require('node:assert/strict');
const Rules = require('../makruk-rules.js');
const Learning = require('../learning-design.js');
let cases = 0;
// Check reachability on every square, not just the examples used in lessons.
for (const piece of ['king','rook','knight','met','khon','promoted']) {
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) for (let distance=1;distance<=3;distance++) {
    const start={r,c},options=Learning.routeTargets(Rules,piece,start,distance);
    assert(options.length, `${piece} ${r},${c} distance ${distance} has a target`);
    assert.equal(new Set(options.map(option=>`${option.at.r},${option.at.c}`)).size,options.length);
    for (const option of options) {
      let current=start;
      assert(option.path.length<=distance);
      assert.notDeepEqual(option.at,start);
      for (const to of option.path) {
        assert(Rules.legalDestinations([{piece,side:'white',at:current}],current).some(at=>at.r===to.r&&at.c===to.c));
        current=to;
      }
      assert.deepEqual(current,option.at);
      // A later puzzle must not be solvable in one step except if the piece's
      // reachable layer is exhausted (a rook reaches every square in two moves).
      if (distance>1) assert(!Rules.legalDestinations([{piece,side:'white',at:start}],start).some(at=>at.r===option.at.r&&at.c===option.at.c));
    }
    cases++;
  }
}
console.log(`Random puzzle routes verified: ${cases} piece / start / difficulty combinations.`);
