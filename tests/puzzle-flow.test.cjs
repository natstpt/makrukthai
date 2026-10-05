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


// Regression: both rook moves give check, but only the starred destination scores.
for(const showStarHint of [true,false]){
  const start={r:3,c:0},goal={r:3,c:7},other={r:0,c:0};
  const task={piece:'rook',start,enemies:[{piece:'king',side:'black',at:{r:0,c:7}}]};
  const lesson={id:'check',type:'check',piece:'rook',challenges:[task],requiredCorrect:3};
  const state={lesson:0,phase:'active',roundIndex:0,current:start,selected:true,completed:false,roundDone:false,showStarHint,starTarget:goal,correctMoves:0,routeMoves:0};
  const context={Rules,lessons:[lesson],state,pieceName:{rook:'เรือ'},displayFiles:'กขคงจฉชญ',boardCaption:{},feedbackEl:{},queueMoveFeedback(){},showToast(){},renderBoard(){},updatePracticeUI(){},isStarPractice(){return true;},moveError(){context.errors++;},errors:0};
  vm.createContext(context);vm.runInContext(functions,context);
  assert(Rules.inCheck(Rules.applyMove(context.boardPieces(),start,other),'black'));
  context.attemptMove(other);assert.equal(state.correctMoves,0);assert.equal(context.errors,1);assert.deepEqual(state.current,start);
  context.attemptMove(goal);assert.equal(state.correctMoves,1);assert(state.roundDone);
}
console.log('Check lesson: alternative check rejected, only the star scores, including with hints hidden.');

// Teaching compares all three pieces on precisely the same square.
for(const [teachingIndex,piece,count] of [[1,'king',8],[2,'khon',5],[3,'met',4]]){
  const context={Rules,lessons:[{id:'review',type:'challenge',piece:'king',challenges:[{piece:'king',start:{r:4,c:3}}]}],state:{lesson:0,phase:'demo',roundIndex:0,teachingIndex,current:{r:4,c:3}},pos:(f,n)=>({r:8-n,c:'abcdefgh'.indexOf(f)})};
  vm.createContext(context);vm.runInContext(functions,context);
  assert.equal(context.activePiece(),piece);assert.equal(context.boardPieces()[0].at.r,4);assert.equal(context.boardPieces()[0].at.c,3);assert.equal(context.moveDestinations().length,count);
}
