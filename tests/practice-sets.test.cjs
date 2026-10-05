'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const Rules=require('../makruk-rules.js'),Notation=require('../makruk-notation.js'),Learning=require('../learning-design.js');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ctx={window:{},pos:(f,n)=>({r:8-n,c:'abcdefgh'.indexOf(f)})};vm.createContext(ctx);
for(const file of ['day2-lessons.js','rules-lessons.js','learning-design.js','practice-sets.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const lessons=vm.runInContext(html.slice(html.indexOf('var lessons = ['),html.indexOf('// Keep internal coordinates stable'))+';lessons',ctx);
const same=(a,b)=>a&&b&&a.r===b.r&&a.c===b.c;let checked=0;
for(const l of lessons){const sets=ctx.window.MakrukPracticeSets[l.id];if(['game','finish'].includes(l.id))continue;assert.equal(sets.length,5,l.id);
const seen=new Set();for(const [setIndex,set]of sets.entries()){assert.equal(set.length,l.requiredGames||l.requiredCorrect||3,l.id);for(const t of set){const ps=t.pieces||[{piece:t.piece||l.piece,side:'white',at:t.start},...(t.friends||[]),...(t.enemies||[])];
const key=JSON.stringify([ps.map(p=>[p.piece,p.side,p.at.r,p.at.c]).sort(),t.target,t.start,t.goals||t.goal,['setup','fair-play'].includes(l.id)?t.mission:null]);assert(!seen.has(key),l.id+' repeated task');seen.add(key);
assert.equal(new Set(ps.map(p=>p.at.r+','+p.at.c)).size,ps.length,l.id+' overlap');assert(ps.every(p=>p.at.r>=0&&p.at.r<8&&p.at.c>=0&&p.at.c<8));
assert(!(Rules.inCheck(ps,'white')&&Rules.inCheck(ps,'black')),l.id+' both kings in check');
if(l.type!=='quiz')assert(!Rules.inCheck(ps,'black'),l.id+' non-moving king already in check');
if(l.type==='check'){assert(t.goal);assert(t.mission.includes(Notation.squareLabel(t.goal)));assert(Rules.inCheck(Rules.applyMove(ps,t.start,t.goal),'black'));}
if(t.choices){assert.equal(t.choices.filter(c=>c.correct).length,1);assert.equal(new Set(t.choices.map(c=>c.text)).size,t.choices.length);}
if(l.coordinateLesson)assert.equal(t.choices.find(c=>c.correct).text,Notation.squareLabel(t.target));
if(l.id==='review'){assert(t.start.r>=2&&t.start.r<=5&&t.start.c>=2&&t.start.c<=5,'review starts in central 4x4');assert((t.goals||[t.goal]).every(g=>g.r>=1&&g.r<=6&&g.c>=1&&g.c<=6),'review target stays away from edge');if(setIndex===0)assert([3,4].includes(t.start.r)&&[3,4].includes(t.start.c),'first review set uses central four squares');}
if(l.routePuzzle){assert(Learning.routeTargets(Rules,l.piece,t.start,t.routeDistance).some(x=>same(x.at,t.goal)));}
else if(t.start){const legal=Rules.legalDestinations(ps,t.start),gs=t.goals||(t.goal?[t.goal]:l.type==='check'?legal.filter(g=>Rules.inCheck(Rules.applyMove(ps,t.start,g),'black')):legal);assert(gs.length,l.id+' unsolvable');for(const g of gs){assert(legal.some(x=>same(x,g)),l.id+' illegal solution');const after=Rules.applyMove(ps,t.start,g);assert(!Rules.inCheck(after,'white'));if(l.type==='notation')assert(Notation.matchesNotation(t.expectedNotation,Notation.formatMove(ps,t.start,g)));if(l.id==='promotion')assert.equal(after.find(x=>same(x.at,g)).piece,'promoted');}}
if(l.id==='block'){assert(require('../scripts/block-safety.cjs')(Rules,ps,t.start,t.goals),'unsafe block in set '+setIndex);assert(Rules.inCheck(ps,'white'));assert(!ps.filter(p=>p.side==='white'&&p.piece==='king').some(p=>Rules.legalDestinations(ps,p.at).length));}
if(l.id==='mate'){const status=Rules.gameStatus(ps,'black'),correct=t.choices.find(c=>c.correct).text;assert.equal(status.state==='checkmate',correct==='รุกจนแล้ว');assert(status.check);}
if(l.id==='draw-rules'&&t.mission.includes('ขุนแดงไม่ถูกรุก'))assert.equal(Rules.gameStatus(ps,'black').state,'stalemate');
if(l.id==='mini')assert(Rules.legalMoves(ps,'white').some(m=>Rules.gameStatus(Rules.applyMove(ps,m.from,m.to),'black').state==='checkmate'),'mini set '+setIndex+' has a mate');
checked++;}}
}
// Exercise actual repeat handler across five sets, preserving unlocked lessons.
const extract=name=>html.match(new RegExp('  function '+name+'\\([^]*?\\n  }'))[0];
const storage=new Map(),flow={lessons:[{id:'board',practiceSets:ctx.window.MakrukPracticeSets.board}],state:{lesson:0,practiceSet:0,correctMoves:5,roundIndex:4,completed:true,phase:'done',unlocked:10},localStorage:{setItem:(k,v)=>storage.set(k,v)},appEl:{classList:{remove(){}}},document:{getElementById(){return {}}},startRound(){}};vm.createContext(flow);vm.runInContext(extract('practiceAnotherSet')+'\n'+extract('challenge'),flow);
for(let set=1;set<5;set++){flow.practiceAnotherSet();assert.equal(flow.state.practiceSet,set);assert.equal(flow.state.correctMoves,0);assert.equal(flow.state.roundIndex,0);assert.equal(flow.state.completed,false);assert.equal(flow.state.phase,'active');assert.equal(flow.state.unlocked,10);assert.equal(JSON.stringify(flow.challenge()),JSON.stringify(ctx.window.MakrukPracticeSets.board[set][0]));flow.state.correctMoves=5;flow.state.completed=true;flow.state.phase='done';}
flow.practiceAnotherSet();assert.equal(flow.state.practiceSet,4);assert.equal(flow.state.completed,true,'last set does not silently recycle');
// Check the primary button transitions, including notation after answering.
const element=()=>({hidden:false,style:{},classList:{toggle(){}}});
for(const type of ['quiz','notation']){const ui={lessons:[{id:type,type,piece:type==='notation'?'rook':null,requiredCorrect:5,practiceSets:ctx.window.MakrukPracticeSets.board}],state:{lesson:0,phase:'active',practiceSet:0,roundIndex:0,roundDone:false,correctMoves:0},practiceCard:element(),practiceCounter:element(),practiceRequirement:element(),nextRoundBtn:element(),mainBtn:element(),speechEl:element(),mobileSpeechEl:element(),missionEl:element(),document:{getElementById:element},isBoardPractice:()=>type==='notation',isStarPractice:()=>false,updateBoardHelp(){},challenge:()=>({mission:'test'})};vm.createContext(ui);vm.runInContext(extract('practiceReady')+'\n'+extract('updatePracticeUI'),ui);ui.updatePracticeUI();assert(ui.mainBtn.disabled);ui.state.roundDone=true;ui.state.correctMoves=1;ui.updatePracticeUI();assert(!ui.mainBtn.disabled);assert(ui.mainBtn.textContent.includes('ถัดไป'));ui.state.correctMoves=5;ui.state.roundIndex=4;ui.updatePracticeUI();assert(!ui.mainBtn.disabled);assert.equal(ui.mainBtn.textContent,'ผ่านบทนี้ →');assert(ui.nextRoundBtn.hidden);}
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
console.log(`Verified ${checked} prepared tasks: five unique sets per exercise, legal solutions, notation, mate/stalemate, repeat reset and next-button flow.`);
