'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Rules=require('../makruk-rules.js');
const Learning=require('../learning-design.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
// Execute the production move handlers, with rendering replaced by no-ops.
// This tests state transitions independently of CSS and browser timing.
const names=['same','squareLabel','challenge','activePiece','isBoardPractice','basePieces','boardPieces','moveDestinations','goalDestinations','attemptMove'];
const functions=names.map(name=>{
  const firstLine=source.slice(source.indexOf('  function '+name+'(')).split(/\r?\n/)[0];
  if(firstLine.trimEnd().endsWith('}'))return firstLine;
  const match=source.match(new RegExp('  function '+name+'\\([^]*?\\n  }'));
  assert(match,`production ${name} exists`);return match[0];
}).join('\n');
let scenarios=0;
for(const piece of ['king','rook','knight','met','khon','promoted']){
  for(const showStarHint of [true,false]){
    const start={r:4,c:3},route=Learning.routeTargets(Rules,piece,start,2)[0];
    const lesson={id:piece,type:'move',piece,start,routePuzzle:true,requiredCorrect:3};
    const state={lesson:0,phase:'active',current:start,selected:true,completed:false,roundDone:false,showStarHint,starTarget:route.at,correctMoves:0,routeMoves:0};
    const context={Rules,lessons:[lesson],state,pieceName:{[piece]:piece},displayFiles:'กขคงจฉชญ',
      boardCaption:{},feedbackEl:{},queueMoveFeedback(){},showToast(){},renderBoard(){},updatePracticeUI(){},isStarPractice(){return true;},
      moveError(){context.errors++;},errors:0};
    vm.createContext(context);vm.runInContext(functions,context);
    context.attemptMove(start);assert.equal(context.errors,1);assert.equal(state.correctMoves,0);
    context.attemptMove(route.path[0]);
    assert.equal(state.correctMoves,0,`${piece}: intermediate legal step is not a collected star`);
    assert.equal(state.roundDone,false,`${piece}: another step is allowed`);
    state.selected=true;context.attemptMove(route.path[1]);
    assert.equal(state.correctMoves,1,`${piece}: only reaching the target awards a star`);
    assert.equal(state.roundDone,true);
    state.selected=true;context.attemptMove(route.path[0]);assert.equal(state.correctMoves,1,'completed puzzle cannot award twice');
    scenarios++;
  }
}
console.log(`Production puzzle flow verified: ${scenarios} piece / hint scenarios, illegal steps and duplicate awards rejected.`);

