const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../editor-model.js');
const R=require('../makruk-rules.js');
test('editor initial setup matches Makruk FEN and legal opening',()=>{
  const s=M.initial();assert.equal(s.pieces.length,32);assert.equal(M.validate(s),'');
  assert.equal(M.fen(s),'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1');
  assert.equal(s.pieces.find(p=>p.side==='white'&&p.piece==='king').at.c,3);
  assert(R.legalMoves(s.pieces,s.turn).length>0);
});
test('FEN preserves both colors and promoted pawn identity, even in editable incomplete boards',()=>{
  const f='8/3m~4/8/3M~4/8/8/8/8 b - - 0 1';
  assert.equal(M.fen(M.parse(f)),f);assert(M.validate(M.parse(f)).includes('ขุน'));
  assert.equal(M.fen(M.parse('8/8/8/8/8/8/8/8 w - - 0 1')),'8/8/8/8/8/8/8/8 w - - 0 1');
});
test('malformed or unsupported FEN cannot replace a draft',()=>{
  for(const f of ['8/8 w','9/8/8/8/8/8/8/8 w - - 0 1','8/8/8/8/8/8/8/7X w - - 0 1','8/8/8/8/8/8/8/7P~ w - - 0 1','8/8/8/8/8/8/8/8 z - - 0 1','8/8/8/8/8/8/8/8 w - 64 2 1'])assert.throws(()=>M.parse(f));
});
test('play validation rejects missing or duplicate kings, adjacent kings and wrong turn check',()=>{
  for(const f of ['8/8/8/8/8/8/8/3K4','3k4/8/8/8/8/8/8/3KK3','8/8/8/3k4/3K4/8/8/8'])assert(M.validate(M.parse(f+' w - - 0 1')));
  const check=M.parse('3k4/8/8/8/3R4/8/8/K7 w - - 0 1');
  assert(M.validate(check).includes('ไม่ได้เดิน'));check.turn='black';assert.equal(M.validate(check),'');
});
test('unpromoted pawn beyond promotion row is editable but cannot start play',()=>{
  const s=M.parse('7k/8/P7/8/8/8/8/K7 w - - 0 1');assert(M.validate(s).includes('เบี้ยหงาย'));
  s.pieces.find(p=>p.piece==='pawn').piece='promoted';assert.equal(M.validate(s),'');
});
test('trial rules enforce king safety and automatically promote',()=>{
  const pinned=M.parse('3r3k/8/8/8/8/8/3R4/3K4 w - - 0 1');assert.equal(M.validate(pinned),'');
  assert(!R.legalDestinations(pinned.pieces,{r:6,c:3}).some(p=>p.c!==3));
  const s=M.parse('7k/8/8/P7/8/8/8/K7 w - - 0 1');
  const moved=R.applyMove(s.pieces,{r:3,c:0},{r:2,c:0});assert.equal(moved.find(p=>p.at.r===2).piece,'promoted');
});
