'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const Rules=require('../makruk-rules.js'),Notation=require('../makruk-notation.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const extract=n=>html.match(new RegExp('  function '+n+'\\([^]*?\\n  }'))[0];
function game(){
 let nextId=0;const timers=new Map(),events=[];
 const state={current:{r:7,c:1},gamePieces:[{piece:'king',side:'white',at:{r:7,c:0}},{piece:'rook',side:'white',at:{r:7,c:1}},{piece:'king',side:'black',at:{r:0,c:7}},{piece:'rook',side:'black',at:{r:0,c:6}}],scoreMoves:[],gameHistory:[],correctMoves:0,replyPending:false};
 const c={state,Rules,Notation,gameReplyTimer:null,same:(a,b)=>a.r===b.r&&a.c===b.c,squareLabel:Notation.squareLabel,pieceName:{king:'ขุน',rook:'เรือ'},pieceFile:{king:'K',rook:'R'},presentation:{replyDelay:()=>330,clearMotion(){},queueMove:m=>events.push(m)},feedbackEl:{},boardCaption:{},finishGame:s=>c.result=s,updateGameUI(){},renderBoard(){},updatePracticeUI(){},showToast(){},setTimeout:(fn,delay)=>{assert.equal(delay,330);timers.set(++nextId,fn);return nextId},clearTimeout:id=>timers.delete(id)};
 vm.createContext(c);vm.runInContext(['queueMoveFeedback','chooseRedMove','playGameMove','cancelGameReply'].map(extract).join('\n'),c);return {c,timers,events};
}
const h=game();h.c.playGameMove({r:4,c:1});assert(h.c.state.replyPending);assert.equal(h.c.state.scoreMoves.length,1);assert.equal(h.events.length,1);assert.equal(h.c.state.gamePieces.find(p=>p.side==='white'&&p.piece==='rook').at.r,4);
h.c.playGameMove({r:3,c:1});assert.equal(h.c.state.scoreMoves.length,1,'input while reply pending cannot move twice');
h.timers.values().next().value();assert(!h.c.state.replyPending);assert.equal(h.c.state.scoreMoves.length,2);assert.equal(h.events.length,2);assert.equal(h.c.state.correctMoves,1);assert.equal(h.events[1].check,Rules.inCheck(h.c.state.gamePieces,'white'));
const cancelled=game();cancelled.c.playGameMove({r:4,c:1});cancelled.c.cancelGameReply();assert.equal(cancelled.timers.size,0,'changing a lesson/round cancels stale opponent callbacks');assert(!cancelled.c.state.replyPending);
const check=game();check.c.state.gamePieces=check.c.state.gamePieces.filter(p=>!(p.side==='black'&&p.piece==='rook'));check.c.playGameMove({r:0,c:1});assert.equal(check.events[0].check,true,'white checking move gets a check cue before opponent reply');
console.log('Deferred game feedback verified: white then red, one score per turn, check cues, input lock and cancellation on navigation.');
