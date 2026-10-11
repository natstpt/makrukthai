'use strict';
// The endgame chapter: every book "ตาจน" really is mate, and every practice task is a one-move mate with one answer.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Rules=require('../makruk-rules.js');
const root=path.join(__dirname,'..'),ctx={window:{}};vm.createContext(ctx);
for(const file of ['endgame-lessons.js','practice-sets.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
// Short-puzzle lessons (red replies) are verified by tests/endgame-puzzles.test.cjs.
const lessons=ctx.window.buildEndgameLessons().filter(l=>!l.puzzle),sets=ctx.window.MakrukPracticeSets;
const mates=ps=>Rules.legalMoves(ps,'white').filter(m=>Rules.gameStatus(Rules.applyMove(ps,m.from,m.to),'black').state==='checkmate');
let boards=0,tasks=0;
assert.equal(lessons.length,4);
for(const l of lessons){
  assert.equal(l.teachingSteps.length,l.teachingBoards.length,l.id+': one board per teaching step');
  l.teachingBoards.forEach((b,i)=>{
    assert(!Rules.inCheck(b.pieces,'white'),l.id+' step '+(i+1)+': white king is safe');
    if(/^ตาจน/.test(b.text))assert.equal(Rules.gameStatus(b.pieces,'black').state,'checkmate',l.id+' step '+(i+1)+' is a real mate');
    else assert(!Rules.inCheck(b.pieces,'black'),l.id+' step '+(i+1)+': setup is not already check');
    boards++;
  });
  const all=l.challenges.concat(sets[l.id].flat());
  assert.equal(sets[l.id].length,5,l.id+': five practice sets');
  for(const t of all){
    const ps=[{piece:t.piece,side:'white',at:t.start}].concat(t.friends,t.enemies);
    assert(!Rules.inCheck(ps,'black')&&!Rules.inCheck(ps,'white'),l.id+': '+t.mission+' starts quiet');
    const found=mates(ps);
    assert.equal(found.length,1,l.id+': '+t.mission+' has exactly one mating move');
    assert.deepEqual(JSON.parse(JSON.stringify(found[0].to)),JSON.parse(JSON.stringify(t.goals[0])),l.id+': the star is the mating square');
    tasks++;
  }
}
console.log('Endgame chapter verified: '+boards+' teaching boards and '+tasks+' one-move mates with a single answer.');
