// Build reviewed, deterministic practice banks. Run after changing lesson examples.
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..'),Rules=require('../makruk-rules.js'),Learning=require('../learning-design.js'),Notation=require('../makruk-notation.js');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const ctx={window:{},pos:(f,n)=>({r:8-n,c:'abcdefgh'.indexOf(f)})};vm.createContext(ctx);
for(const file of ['day2-lessons.js','rules-lessons.js','learning-design.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const lessons=vm.runInContext(html.slice(html.indexOf('var lessons = ['),html.indexOf('// Keep internal coordinates stable'))+';lessons',ctx);
const clone=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>a&&b&&a.r===b.r&&a.c===b.c,label=Notation.squareLabel;
const names={king:'ขุน',rook:'เรือ',knight:'ม้า',khon:'โคน',met:'เม็ด',pawn:'เบี้ย',promoted:'เบี้ยหงาย'};
function pieces(t,l){return t.pieces||[{piece:t.piece||l.piece,side:'white',at:t.start},...(t.friends||[]),...(t.enemies||[])];}
function signature(t,l){return JSON.stringify([pieces(t,l).map(p=>[p.piece,p.side,p.at.r,p.at.c]).sort(),t.target,t.start,t.goals||t.goal]);}
function profile(ps){return JSON.stringify({status:['white','black'].map(s=>Rules.gameStatus(ps,s)),edges:ps.map(p=>ps.map(q=>Rules.isAttacked([p,...ps.filter(x=>x!==p).map(x=>({...x,side:'obstacle'}))],q.at,p.side))),kingMoves:ps.filter(p=>p.piece==='king').map(p=>Rules.legalDestinations(ps,p.at).length>0)});}
function goals(t,l){const ps=pieces(t,l),legal=Rules.legalDestinations(ps,t.start);return t.goals||(t.goal?[t.goal]:l.type==='check'?legal.filter(to=>Rules.inCheck(Rules.applyMove(ps,t.start,to),'black')):legal);}
function tacticalProfile(ps,l){return l.id==='draw-rules'?JSON.stringify(['white','black'].map(side=>Rules.gameStatus(ps,side))):profile(ps);}
function valid(t,b,l){const ps=pieces(t,l),old=pieces(b,l);if(ps.some(p=>p.at.r<0||p.at.r>7||p.at.c<0||p.at.c>7)||new Set(ps.map(p=>p.at.r+','+p.at.c)).size!==ps.length)return false;
if(l.id==='review'&&(t.start.r<2||t.start.r>5||t.start.c<2||t.start.c>5||goals(t,l).some(g=>g.r<1||g.r>6||g.c<1||g.c>6)))return false;
if(Rules.inCheck(ps,'white')&&Rules.inCheck(ps,'black'))return false;
if(l.type!=='quiz'&&Rules.inCheck(ps,'black'))return false;
if(ps.some(p=>p.piece==='pawn'&&(p.side==='white'?p.at.r<3:p.at.r>4)))return false;
if(tacticalProfile(ps,l)!==tacticalProfile(old,l))return false;
if((l.id==='block'||b.block)&&!require('./block-safety.cjs')(Rules,ps,t.start,goals(t,l)))return false;
if(l.id==='mini'&&!Rules.legalMoves(ps,'white').some(m=>Rules.gameStatus(Rules.applyMove(ps,m.from,m.to),'black').state==='checkmate'))return false;
if(t.start){let gs=goals(t,l),og=goals(b,l);if(!gs.length||gs.length!==og.length&&!!(b.goals||b.goal))return false;const legal=Rules.legalDestinations(ps,t.start);if(!gs.every(g=>legal.some(p=>same(p,g))))return false;
if(b.goals||b.goal)for(let i=0;i<gs.length;i++){const n=Notation.formatMove(ps,t.start,gs[i]),o=Notation.formatMove(old,b.start,og[i]);if(n.capture!==o.capture||n.check!==o.check||n.mate!==o.mate||n.promotion!==o.promotion)return false;if(tacticalProfile(Rules.applyMove(ps,t.start,gs[i]),l)!==tacticalProfile(Rules.applyMove(old,b.start,og[i]),l))return false;}}
return true;}
function transform(t,fn){function walk(v){if(!v||typeof v!=='object')return v;if(Number.isInteger(v.r)&&Number.isInteger(v.c))return fn(v);return Array.isArray(v)?v.map(walk):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)]));}return walk(t);}
function wording(t,b,l){t=clone(t);const mapping={};pieces(b,l).forEach((p,i)=>mapping[label(p.at)]=label(pieces(t,l)[i].at));if(b.start)mapping[label(b.start)]=label(t.start);(b.goals||[b.goal]).filter(Boolean).forEach((p,i)=>mapping[label(p)]=label((t.goals||[t.goal])[i]));
for(const key of ['mission','hint','explanation','success'])if(b[key])t[key]=b[key].replace(/[กขคงจฉชญ][1-8]/g,s=>mapping[s]||s).replace(/พา/g,'เดิน');
if(l.type==='check'){const king=pieces(t,l).find(p=>p.side==='black'&&p.piece==='king');t.goal={r:t.start.r,c:king.at.c};t.mission='เดินเรือจาก '+label(t.start)+' ไปช่องดาว '+label(t.goal)+' เพื่อรุกขุน '+label(king.at);}
if(t.start){const gs=goals(t,l);t.hint='เลือก'+names[t.piece||l.piece]+'ที่ '+label(t.start)+' แล้วลองเดินไป '+gs.map(label).join(' หรือ ');if(l.id==='defend')t.hint+=' เพื่อผูกหมาก ให้มีตัวกินกลับ ไม่เสียหมากฟรี';if(l.type==='notation')t.expectedNotation=Notation.formatMove(pieces(t,l),t.start,gs[0]).text;}
if(l.id==='mini'){const ps=pieces(t,l),m=Rules.legalMoves(ps,'white').find(m=>Rules.gameStatus(Rules.applyMove(ps,m.from,m.to),'black').state==='checkmate');t.hint='ลองเดินเรือจาก '+label(m.from)+' ไป '+label(m.to)+' ขุนขาวช่วยปิดช่องหนีของขุนแดง';}
return t;}
// Beginners answer from two choices: the correct one and the first distractor, alternating which comes first.
function twoChoices(t,flip){if(!t.choices||t.choices.length<=2)return t;t=clone(t);const right=t.choices.find(c=>c.correct),wrong=t.choices.find(c=>!c.correct);t.choices=flip%2?[wrong,right]:[right,wrong];return t;}
const bank={};
for(const l of lessons){if(l.type==='finish'||l.id==='game')continue;const count=l.requiredGames||l.requiredCorrect||3,all=[],seen=new Set();
const add=t=>{const k=signature(t,l);if(seen.has(k))return false;seen.add(k);all.push(t);return true;};
if(l.coordinateLesson){for(let i=0;i<25;i++){let target={r:Math.floor((i*19+5)%64/8),c:(i*19+5)%8},answer=label(target);let choices=[{text:answer,correct:true},{text:label(i%2?{...target,r:(target.r+1)%8}:{...target,c:(target.c+1)%8}),correct:false}];choices.push(...choices.splice(0,Math.floor(i/2)%2));all.push({target,pieces:[],mission:'ช่องที่มีกรอบชื่ออะไร?',choices,hint:'อ่านตัวอักษรด้านล่างก่อน แล้วตามด้วยเลขด้านข้าง',explanation:'ถูกแล้ว! ช่องนี้ชื่อ '+answer});}}
else if(l.routePuzzle){for(let i=0;i<count*5;i++){const start={r:Math.floor((i*13+27)%64/8),c:(i*13+27)%8},distance=1+i%count,opts=Learning.routeTargets(Rules,l.piece,start,distance),goal=opts[(i*7)%opts.length].at;all.push({piece:l.piece,start,goal,routeDistance:distance,mission:'เดิน'+names[l.piece]+'ไปเก็บดาวที่ '+label(goal),hint:l.rule});}}
else if(l.id==='promotion'){for(let i=0;i<15;i++){const c=i%8,start={r:3,c},to={r:2,c:i<8?c:c+1};all.push({piece:'pawn',start,goal:to,enemies:i<8?[]:[{piece:'met',side:'black',at:to}],mission:i<8?'เดินเบี้ยไป '+label(to)+' แล้วดูเบี้ยหงาย':'กินเม็ดที่ '+label(to)+' แล้วดูเบี้ยหงาย',hint:i<8?'เบี้ยเดินตรง 1 ช่อง':'เบี้ยกินเฉียงหน้า 1 ช่อง ถึงแถว 6 แล้วหงาย'});}}
else if(l.id==='setup'||l.id==='fair-play'){const rows=require('./practice-question-data.cjs')[l.id];rows.forEach((row,i)=>{let choices=row.slice(1,3).map((text,j)=>({text,correct:j===0}));choices.push(...choices.splice(0,i%2));all.push({pieces:clone(l.questions[0].pieces),mission:row[0],choices,hint:l.id==='setup'?'ลองดูตำแหน่งหมากบนกระดาน แล้วนับหรืออ่านชื่อช่อง':'เลือกวิธีที่สุภาพและช่วยให้ทั้งสองคนเล่นสนุก',explanation:row[1]});});}
else {const bases=clone(l.challenges||l.questions||l.games);const pools=bases.map(b=>{const pool=[],local=new Set();const accept=t=>{if(valid(t,b,l)){const k=signature(t,l);if(!local.has(k)){local.add(k);pool.push(wording(t,b,l));}}};
if(l.id==='block')accept(b);
for(let mirror=0;mirror<2;mirror++)for(let dr=-7;dr<=7;dr++)for(let dc=-7;dc<=7;dc++)accept(transform(b,p=>({r:p.r+dr,c:(mirror?7-p.c:p.c)+dc})));
// Keep the tactical relationships while moving a supporting piece to a new square.
for(const seed of [b,...pool.slice(0,8)]){const ps=pieces(seed,l);for(let p=0;p<ps.length;p++){if(same(ps[p].at,seed.start)||(seed.goals||[seed.goal]).some(g=>same(g,ps[p].at)))continue;for(let r=0;r<8;r++)for(let c=0;c<8;c++){let t=clone(seed);let list=t.pieces||[null,...(t.friends||[]),...(t.enemies||[])];if(!list[p])continue;list[p].at={r,c};if(valid(t,seed,l))accept(t);}}if(pool.length>80)break;}
if(l.id==='review'){const centerDistance=p=>Math.abs(p.r-3.5)+Math.abs(p.c-3.5);pool.sort((a,b)=>centerDistance(a.start)-centerDistance(b.start)||centerDistance(goals(a,l)[0])-centerDistance(goals(b,l)[0]));}
return pool;});
for(let set=0;set<5;set++)for(let i=0;i<count;i++){const pool=pools[i%bases.length];const chosen=pool.find(t=>!seen.has(signature(t,l)));if(!chosen)throw Error(l.id+' insufficient variants for set '+set+' task '+i+' pools '+pools.map(p=>p.length));add(twoChoices(chosen,set+i));}}
if(all.length!==count*5)throw Error(l.id+' count '+all.length+' expected '+count*5);bank[l.id]=Array.from({length:5},(_,i)=>all.slice(i*count,(i+1)*count));console.log(l.id,all.length);
}
fs.writeFileSync(path.join(root,'practice-sets.js'),'// Five prepared sets per exercise. Generated and checked against MakrukRules.\n(function(root){root.MakrukPracticeSets='+JSON.stringify(bank,null,2)+';})(window);\n');
