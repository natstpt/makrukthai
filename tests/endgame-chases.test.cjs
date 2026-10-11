'use strict';
// Long chases (ไล่ยาว): chase-trees.js is checked against makruk-rules.js. Every accepted white move is legal,
// "#" is a real mate, every red reply is legal, and no line runs past the moves allowed by the mission or the count.
// Near the end of each line (three moves or fewer left) the accepted moves must equal exactly the moves that still
// mate in time, found by the independent puzzle solver.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Rules=require('../makruk-rules.js');
const {createSolver,moveKey,fromKey}=require('../scripts/puzzle-solver.cjs');
const root=path.join(__dirname,'..'),ctx={window:{}};vm.createContext(ctx);
for(const file of ['endgame-lessons.js','chase-trees.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
const lessons=plain(ctx.window.buildEndgameLessons().filter(l=>l.games&&l.games.some(t=>t.chase))),trees=plain(ctx.window.MakrukChaseTrees);
const solver=createSolver();
const decode=s=>Object.fromEntries((s||'').split(',').filter(Boolean).map(e=>[e.slice(0,4),e[4]==='#'?'#':{r:e.slice(4,8),n:parseInt(e.slice(8),36)}]));
assert.deepEqual(lessons.map(l=>l.id),['chase-rook','chase-knight-met','chase-khon-pair','chase-knight-khon']);
let chases=0,visited=0,exact=0;
for(const l of lessons){
  for(const t of l.games){
    const label=l.id+' '+t.key,tree=trees[t.key];
    assert(t.chase&&tree,label+': has a chase tree');
    assert.equal(t.count.start,t.pieces.length+1,label+': red counts from the number of pieces + 1');
    assert(t.moves<=t.count.ceiling-t.count.start+2,label+': the counting rule leaves enough moves');
    assert(tree.dtm<=t.moves&&t.moves-tree.dtm<=1,label+': at most one spare move');
    const seen=new Set();
    const walk=(pieces,ref,left)=>{
      const key=ref+':'+left;if(seen.has(key))return;seen.add(key);visited++;
      const node=decode(tree.nodes[ref]);
      assert(Object.keys(node).length>0,label+': every reached position has a winning move');
      if(left<=3){
        const expected=Rules.legalMoves(pieces,'white').filter(m=>solver.mates(Rules.applyMove(pieces,m.from,m.to),left)).map(moveKey).sort();
        assert.deepEqual(Object.keys(node).sort(),expected,label+': accepts exactly the moves that mate within '+left);exact++;
      }
      for(const [move,child] of Object.entries(node)){
        const m=fromKey(move);
        assert(Rules.legalMoves(pieces,'white').some(x=>moveKey(x)===move),label+': '+move+' is legal');
        const after=Rules.applyMove(pieces,m.from,m.to);
        if(child==='#'){assert.equal(Rules.gameStatus(after,'black').state,'checkmate',label+': '+move+' mates');continue;}
        assert(left>1,label+': no line runs past the moves allowed');
        assert(Rules.legalMoves(after,'black').some(x=>moveKey(x)===child.r),label+': red reply '+child.r+' is legal');
        const r=fromKey(child.r);walk(Rules.applyMove(after,r.from,r.to),child.n,left-1);
      }
    };
    walk(plain(t.pieces),0,t.moves);
    chases++;
  }
}
assert.equal(Object.keys(trees).length,chases,'no stale chase trees');
console.log('Endgame chases verified: '+chases+' chases, '+visited+' positions, '+exact+' end positions checked against the solver.');
