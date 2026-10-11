'use strict';
// Short puzzles (กลสั้น): every book puzzle mates in exactly the book's number of moves, puzzle-trees.js
// matches a fresh solve, and every node accepts exactly the white moves that still mate in time.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Rules=require('../makruk-rules.js');
const {createSolver,moveKey,fromKey}=require('../scripts/puzzle-solver.cjs');
const root=path.join(__dirname,'..'),ctx={window:{}};vm.createContext(ctx);
for(const file of ['endgame-lessons.js','puzzle-trees.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
const lessons=plain(ctx.window.buildEndgameLessons().filter(l=>l.puzzle)),trees=plain(ctx.window.MakrukPuzzleTrees);
const solver=createSolver();
assert.deepEqual(lessons.map(l=>l.id),['endgame-stalemate','endgame-count','endgame-corner','endgame-tempo','puzzle-khon','puzzle-khon-met','puzzle-knight']);
let boards=0,puzzles=0,nodes=0;const keys=new Set();
function walk(pieces,node,left,label){
  nodes++;
  const expected=Rules.legalMoves(pieces,'white').filter(m=>solver.mates(Rules.applyMove(pieces,m.from,m.to),left)).map(moveKey).sort();
  assert.deepEqual(Object.keys(node).sort(),expected,label+': accepts exactly the moves that mate within '+left);
  for(const [key,child] of Object.entries(node)){
    const m=fromKey(key),after=Rules.applyMove(pieces,m.from,m.to);
    if(child==='#'){assert.equal(Rules.gameStatus(after,'black').state,'checkmate',label+' '+key+' is mate');continue;}
    const reply=fromKey(child.r);
    assert(Rules.legalMoves(after,'black').some(r=>moveKey(r)===child.r),label+' '+key+': red reply is legal');
    const next=Rules.applyMove(after,reply.from,reply.to),longest=Math.max(...Rules.legalMoves(after,'black').map(r=>solver.depth(Rules.applyMove(after,r.from,r.to),left-1)));
    assert.equal(solver.depth(next,left-1),longest,label+' '+key+': red picks the longest defence');
    walk(next,child.n,longest,label+' '+key+' '+child.r);
  }
}
for(const l of lessons){
  assert.equal(l.type,'game');assert(l.endgame&&l.bookPages.length&&l.sourceNotes.length===2);
  assert.equal(l.requiredCorrect,l.games.length,l.id+': solve every puzzle');
  assert.equal(l.teachingSteps.length,l.teachingBoards.length);
  l.teachingBoards.forEach((b,i)=>{
    const label=l.id+' step '+(i+1);
    assert(!Rules.inCheck(b.pieces,'white'),label+': white king is safe');
    if(/^(ตาจน|จน) ·/.test(b.text))assert.equal(Rules.gameStatus(b.pieces,'black').state,'checkmate',label+' is mate');
    else if(/^อับ/.test(b.text))assert.equal(Rules.gameStatus(b.pieces,'black').state,'stalemate',label+' is stalemate');
    else assert(!Rules.inCheck(b.pieces,'black'),label+': not already check');
    boards++;
  });
  for(const t of l.games){
    const pieces=plain(t.pieces),label=l.id+' '+t.key;
    assert(!keys.has(t.key),label+': unique key');keys.add(t.key);
    assert(!Rules.inCheck(pieces,'black')&&!Rules.inCheck(pieces,'white'),label+': starts quiet');
    assert.equal(solver.depth(pieces,t.moves),t.moves,label+': mate in exactly '+t.moves);
    assert(t.mission.includes('รุกจนใน '+t.moves+' ตา'),label+': mission states the move count');
    // The book line is legal from the start position and its first move is accepted.
    let ps=pieces;for(const [i,key] of t.line.entries()){const m=fromKey(key);assert(Rules.legalMoves(ps,i%2?'black':'white').some(x=>moveKey(x)===key),label+': book move '+key+' is legal');ps=Rules.applyMove(ps,m.from,m.to);}
    if(t.line.length)assert(trees[t.key][t.line[0]],label+': the book first move is accepted');
    assert.deepEqual(trees[t.key],plain(solver.solutionTree(pieces,t.moves,t.line)),label+': puzzle-trees.js is up to date');
    walk(pieces,trees[t.key],t.moves,label);
    if(l.id==='endgame-stalemate')assert(Rules.legalMoves(pieces,'white').some(m=>Rules.gameStatus(Rules.applyMove(pieces,m.from,m.to),'black').state==='stalemate'),label+': has a stalemate trap');
    puzzles++;
  }
}
assert.equal(Object.keys(trees).length,puzzles,'no stale trees');
console.log('Endgame puzzles verified: '+boards+' teaching boards, '+puzzles+' puzzles, '+nodes+' solution nodes.');
