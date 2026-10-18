(function(){
  'use strict';
  var M=window.MakrukEditor,R=window.MakrukRules,P=window.MakrukPlay,N=window.MakrukNotation,$=function(id){return document.getElementById(id);};
  var names={king:'ขุน',khon:'โคน',met:'เม็ด',knight:'ม้า',rook:'เรือ',pawn:'เบี้ย',promoted:'เบี้ยหงาย'};
  var icons={king:'K',khon:'B',met:'Q',knight:'N',rook:'R',pawn:'P',promoted:'F'};
  var files=['ก','ข','ค','ง','จ','ฉ','ช','ญ'];
  var state=M.initial(),mode='edit',tool='move',selected=null,flipped=false,history=[],future=[],trial=null,moves=[],last=null;
  var storageKey='makrukTeachingEditorV1',notice='',storageOK=true,drag=null,suppressClick=false;
  try{var saved=localStorage.getItem(storageKey);if(saved)state=M.parse(saved);}catch(e){notice='เปิดตำแหน่งที่เก็บไว้ไม่ได้ จึงแสดงตำแหน่งเริ่มเกม';}
  try{var sharedParams=new URLSearchParams(location.hash.slice(1));if(sharedParams.has('fen')){state=M.parse(sharedParams.get('fen'));flipped=sharedParams.get('flip')==='1';notice='เปิดตำแหน่งจากลิงก์แชร์แล้ว';}}catch(e){notice='ลิงก์ตำแหน่งไม่ถูกต้อง จึงเปิดตำแหน่งที่เก็บไว้แทน';}
  var sound=window.MakrukPresentation.create({board:$('board'),wrap:$('boardWrap')});
  function same(a,b){return a&&b&&a.r===b.r&&a.c===b.c;}
  function opponent(side){return side==='white'?'black':'white';}
  function sideName(side){return side==='white'?'ขาว':'แดง';}
  // Games opened from the lesson page's settings: editor.html?play=2 (two players on one device) or
  // ?play=ai&side=white|black&level=easy|medium|hard (the learner plays that side against the computer). Every level is
  // Fairy-Stockfish (engine-ai.js) after the same opening shape, with the limits in AI_LIMITS: hard searches toward 20
  // plies for at most 3 seconds a move, medium 5 plies and easy 1 ply with a low Skill Level (now and then a weaker
  // move), both on the small lite engine. If no engine runs in this browser, the player in makruk-play.js plays instead
  // (easy making a mistake now and then).
  var game=null;
  // The stand-alone test page (ai/index.html, made by scripts/build-ai-page.cjs): the hard AI only, outside the
  // lessons — no way back to them, no hint (a เริ่มใหม่ button instead), the level and side in large type.
  var standalone=window.MAKRUK_PAGE==='ai';
  if(standalone){var aiParams={};try{aiParams=new URLSearchParams(location.search);}catch(e){}game={ai:true,human:aiParams.get&&aiParams.get('side')==='black'?'black':'white',level:'hard',standalone:true};}
  else try{var playParams=new URLSearchParams(location.search);if(playParams.get('play')==='2')game={ai:false};else if(playParams.get('play')==='ai')game={ai:true,human:playParams.get('side')==='black'?'black':'white',level:['easy','hard'].indexOf(playParams.get('level'))>=0?playParams.get('level'):'medium',lesson:playParams.get('lesson')};}catch(e){}
  function aiSide(){return game&&game.ai?opponent(game.human):null;}
  // The AI's opening shape (makruk-play.js OPENINGS): as red always the centre shape ง5 จ5 (the flank shape would
  // leave red to deal with an advanced pawn on จ5); as white, each game picks at random between the centre shape ง4 จ4
  // and the flank shape จ4 ฉ4, which brings ม.ช1-ฉ3 and ม็.จ1-ฉ2-จ3 up right behind its pawns.
  function pickShape(){if(game&&game.ai)game.shape=aiSide()==='white'&&Math.random()<0.5?'flank':'centre';}
  pickShape();
  function aiTurn(){return mode==='play'&&!!aiSide()&&state.turn===aiSide();}
  // Counting to a draw (กติกา ข้อ ก 5) while playing; kept in the undo history with the position.
  var count=null;
  function startCount(){count=P.nextCount(null,state.pieces,opponent(state.turn));}
  function playStatus(){if(game&&game.resigned)return {state:'resign',winner:aiSide(),check:false};var s=R.gameStatus(state.pieces,state.turn);return s.state!=='playing'?s:count&&count.draw?{state:'countdraw',check:s.check}:repetitions(M.fen(state))>=3?{state:'repetition',check:s.check}:s;}
  // Draw by repetition: the same position (pieces and side to move) a third time, at any point of the game, ends it.
  // Each move record keeps the position after it (fen) and its key (uci).
  function repetitions(fen){return (trial&&M.fen(trial.state)===fen?1:0)+moves.filter(function(m){return m.fen===fen;}).length;}
  // The special board count (ข้อ ข 4.2) is asked for while unpromoted pawns are still on the board.
  function canAskSpecial(){return P.canRequestSpecialCount(state.pieces,count,moves,trial&&M.fen(trial.state));}
  function askCount(side){count=P.canRequestBoardCount(state.pieces,count)?P.requestBoardCount(side):P.requestSpecialCount(side,state.pieces);}
  var aiTimer=0,aiSearch=0,E=window.MakrukEngine,engine={state:'off',progress:0};
  var AI_LIMITS={easy:{depth:1,skill:3},medium:{depth:5},hard:{depth:20,time:3000}};
  // The hard AI's first 20 moves search the full 20 plies, however long that takes (given up only after 2 minutes);
  // from its 21st move on, AI_LIMITS (at most 3 seconds a move).
  var HARD_FULL_DEPTH_MOVES=20;
  function aiLimits(){
    if(game.level!=='hard')return AI_LIMITS[game.level];
    var played=moves.filter(function(m){return m.side===aiSide();}).length;
    return played<HARD_FULL_DEPTH_MOVES?{depth:20,wait:120000}:AI_LIMITS.hard;
  }
  function engineAi(){return !!game&&!!game.ai&&engine.state!=='failed';}
  function cancelAi(){clearTimeout(aiTimer);aiTimer=0;aiSearch++;think=null;}
  // The stand-alone page's thinking bar (ai/): while the AI searches, how far it has got, 0 to 100%. The depth reached
  // counts by the work each ply takes (about 1.5 times the one before), and between two plies the bar moves on with
  // the time the next one should take, so it never stands still; a search with a time limit also moves with the clock.
  var think=null,THINK_GROWTH=1.5;
  function thinkWork(d){return (Math.pow(THINK_GROWTH,d)-1)/(THINK_GROWTH-1);}
  function thinkPercent(t,now){
    var elapsed=now-t.start;
    if(t.quick)return Math.min(1,elapsed/t.quick);
    var d=t.depth,base=thinkWork(d)/thinkWork(t.target),step=(thinkWork(d+1)-thinkWork(d))/thinkWork(t.target);
    var since=now-(t.at[d]||t.start),expect=Math.max(80,((t.at[d]||t.start)-(t.at[d-1]||t.start))*THINK_GROWTH);
    var p=Math.min(0.99,base+step*Math.min(0.95,since/expect));
    if(t.time)p=Math.max(p,Math.min(0.99,elapsed/t.time));
    return p;
  }
  function drawThink(){
    var bar=$('thinkBar');if(!bar||!game||!game.standalone)return;
    var now=Date.now(),pct=0,text='',status=mode==='play'?playStatus():null,busy=false;
    if(engine.state==='loading'&&aiTurn()){pct=(engine.progress||0)/100;text='กำลังโหลด AI ระดับยาก '+(engine.progress||0)+'%';busy=true;}
    else if(think&&think.done&&now-think.done<700){pct=1;text='AI เดินแล้ว · 100%';}
    else if(think&&!think.done){pct=thinkPercent(think,now);text='AI กำลังคิด… '+Math.round(pct*100)+'%';busy=true;}
    else if(status&&status.state!=='playing')text='เกมจบแล้ว · กดเริ่มใหม่เพื่อเล่นอีกเกม';
    else if(future.length)text='กำลังย้อนดูตาเดิน';
    else text='ถึงตาคุณเดิน · คุณเป็นฝ่าย'+sideName(game.human);
    // Game over: a small เริ่มเกมใหม่ button beside the title (it keeps its place while hidden); in the review the
    // coach takes the bar's place.
    var over=!!status&&status.state!=='playing'||reviewing;bar.hidden=reviewing;$('topNewGame').style.visibility=over?'visible':'hidden';
    $('thinkFill').style.width=Math.round(pct*100)+'%';$('thinkText').textContent=text;bar.classList.toggle('busy',busy);bar.classList.toggle('done',pct>=1);bar.classList.toggle('idle',!busy&&pct<1);
  }
  function moveKey(m){return 'abcdefgh'[m.from.c]+(8-m.from.r)+'abcdefgh'[m.to.c]+(8-m.to.r);}
  // The engine loads once: for the hard AI the full engine (48 MB the first time) on strong computers, the lite one
  // (1.4 MB) on phones and light browsers; easy and medium always use the lite one (engine-ai.js). If neither can run
  // here, the player in makruk-play.js plays instead.
  // When the medium or hard AI cannot run here, the player is told once that the game goes on against the easy AI
  // (the simple player in makruk-play.js), why, and how to fix it when that is known.
  function fallbackNotice(){
    if(!game||!game.ai||game.level==='easy')return;
    $('fallbackText').textContent='เครื่องหรือเบราว์เซอร์นี้ไม่รองรับ AI ระดับ'+{medium:'กลาง',hard:'ยาก'}[game.level]+' ตอนนี้จึงเล่นกับ AI ระดับง่ายแทน';
    $('fallbackReason').textContent=engine.reason||'';$('fallbackReason').hidden=!engine.reason;
    if($('fallbackDialog').showModal)$('fallbackDialog').showModal();
  }
  $('closeFallback').onclick=function(){$('fallbackDialog').close();};
  function loadEngine(){
    if(!E){engine.state='failed';fallbackNotice();return;}
    engine.state='loading';
    E.start(function(f){var pct=Math.floor(f*100);if(pct!==engine.progress){engine.progress=pct;render();}},game.level!=='hard')
      .then(function(){engine.state='ready';render();},function(e){engine.state='failed';engine.reason=(e&&e.reason)||'เบราว์เซอร์นี้ยังไม่รองรับ';render();fallbackNotice();scheduleAi();});
  }
  $('requestCount').addEventListener('click',function(){
    if(!P.canRequestBoardCount(state.pieces,count)&&!canAskSpecial())return;
    remember();askCount(state.turn);render();
  });
  function scheduleAi(){
    cancelAi();
    // While an earlier position of the game is on the board (moves to go forward to), the AI waits. On the player's
    // turn the engine searches the position for the game review; on the AI's turn that search stops at once.
    if(!aiTurn()||future.length||playStatus().state!=='playing'){ponder();return;}
    if(pondering&&E&&E.stopSearch)E.stopSearch();
    var token=aiSearch,hard=engineAi();
    // Engine AI: the opening shape first (ง4 จ4 / ง5 จ5 pawns, then the pieces behind them); once it is done or has
    // to stop, the engine plays the rest of the game. Decided now, so an engine move does not wait the opening delay.
    var book=hard&&!game.bookDone&&P.openingChoice(state.pieces,state.turn,game.shape);
    // The answer to an advanced pawn against the flank shape (makruk-play.js FLANK_ANSWER) is played even after the
    // shape has handed over to the engine.
    if(hard&&game.bookDone&&!book)book=P.flankAnswer(state.pieces,state.turn,game.shape);
    if(hard&&!book)game.bookDone=true;
    var delay=hard?(book||game.level!=='hard'?500:100):700;
    think={start:Date.now(),depth:0,at:{},target:20,quick:book||!hard?delay:0,time:0};
    aiTimer=setTimeout(function(){
      aiTimer=0;if(token!==aiSearch||!aiTurn())return;
      // The AI asks for the ordinary board count when it is behind; the special count is for the player only.
      if(P.canRequestBoardCount(state.pieces,count)&&P.material(state.pieces,state.turn)<P.material(state.pieces,opponent(state.turn)))count=P.requestBoardCount(state.turn);
      var repeats=function(ps,turn){return repetitions(M.fen({pieces:ps,turn:turn}));};
      var easy=function(){var move=P.chooseMove(state.pieces,state.turn,{count:count,repeats:repeats,shape:game.shape,mistakes:game.level==='easy'?0.35:0});if(move)playMove(move.from,move.to);};
      // King + rook against a lone king: the medium and hard AI play from the endgame table (tablebase.js) at once,
      // the rook side mating soonest, the lone king holding out longest. The easy AI keeps its own (fallible) play.
      // Another endgame table this position needs (knight, khon, met …) loads first; the AI then moves from it.
      if(game.level!=='easy'&&window.MakrukTablebase&&MakrukTablebase.need(state.pieces,false,state.turn)){
        MakrukTablebase.ensure(state.pieces,false,state.turn).then(function(){if(token===aiSearch&&aiTurn())scheduleAi();});return;
      }
      var table=game.level!=='easy'&&window.MakrukTablebase&&MakrukTablebase.bestMove(state.pieces,state.turn);
      if(table){if(think)think.quick=1;playMove(table.move.from,table.move.to);return;}
      if(!hard){easy();return;}
      if(book){playMove(book.from,book.to);return;}
      // The engine gets the moves since the last pawn move or capture (no position before it can come back), so it
      // sees the repetitions and never needs a promotion suffix.
      var since=moves.length;while(since>0&&moves[since-1].piece!=='pawn'&&!moves[since-1].capture)since--;
      var searched=M.fen(state),limits=Object.assign({},aiLimits()),mine=think;
      if(mine){mine.target=limits.depth||20;mine.time=limits.time||0;mine.start=Date.now();}
      limits.onDepth=function(d){if(mine&&think===mine){mine.depth=d;mine.at[d]=Date.now();}};
      E.bestMove(since?moves[since-1].fen:M.fen(trial.state),moves.slice(since).map(function(m){return m.uci;}),limits).then(function(key){
        keepAiSearch(searched);
        if(token!==aiSearch||!aiTurn())return;
        var move=key&&R.legalMoves(state.pieces,state.turn).find(function(m){return moveKey(m)===key;});
        if(move)playMove(move.from,move.to);else easy();
      },function(){if(token===aiSearch&&aiTurn())easy();});
    },delay);
  }
  // A finished game against the AI is counted for its level (makrukAiGames), once per game; the play-the-computer
  // lessons (ai-lessons.js) pass after one.
  function recordGame(result){
    if(!game||!game.ai||game.recorded)return;
    game.recorded=true;
    try{
      var all=JSON.parse(localStorage.getItem('makrukAiGames')||'{}'),rec=all[game.level]||{done:0,won:0};
      rec.done++;if(result.winner===game.human)rec.won++;all[game.level]=rec;
      localStorage.setItem('makrukAiGames',JSON.stringify(all));
    }catch(e){}
  }
  // ถอดหมาก (editor.html?analysis=1, or #fen= for a position): both sides move freely while the hard AI
  // (engine-ai.js) analyses every position with three lines. The assistance options switch each part on or off.
  var analysis=false;try{analysis=new URLSearchParams(location.search).get('analysis')==='1';}catch(e){}
  var assist={bar:true,arrows:true,threats:true,lines:true,feedback:true};
  try{var savedAssist=JSON.parse(localStorage.getItem('makrukAssist')||'{}');Object.keys(assist).forEach(function(k){if(typeof savedAssist[k]==='boolean')assist[k]=savedAssist[k];});}catch(e){}
  var view={fen:null,lines:[],depth:0,done:false,prev:null,moves:0,error:''};
  function square(key,i){return {r:8-Number(key.charAt(i+1)),c:'abcdefgh'.indexOf(key.charAt(i))};}
  // A score from the side to move, as pawns for white (a mate counts as 100).
  function whiteValue(score,turn){var v=score.mate!==undefined?(score.mate>0?100:-100):score.cp/100;return turn==='white'?v:-v;}
  function scoreText(score,turn){
    if(score.mate!==undefined){var m=turn==='white'?score.mate:-score.mate;return (m>0?'+':'-')+'M'+Math.abs(m);}
    var v=whiteValue(score,turn);return (v>=0?'+':'')+v.toFixed(2);
  }
  function pvText(pv,limit){
    var ps=R.clonePieces(state.pieces),turn=state.turn,ply=moves.length+(trial&&trial.state.turn==='black'?1:0),out=[];
    for(var i=0;i<pv.length&&i<limit;i++){
      var from=square(pv[i],0),to=square(pv[i],2),rec=N.formatMove(ps,from,to);if(!rec)break;
      var no=Math.floor(ply/2)+1;
      out.push((turn==='white'?no+'. ':i===0?no+'… ':'')+rec.text.replace(/ - /g,'-').replace(/ × /g,'×'));
      ps=R.applyMove(ps,from,to);turn=opponent(turn);ply++;
    }
    return out.join(' ');
  }
  function arrow(key,color,dashed){
    var a=square(key,0),b=square(key,2),pt=function(s){return {x:(flipped?7-s.c:s.c)+0.5,y:(flipped?7-s.r:s.r)+0.5};};
    var p=pt(a),q=pt(b),dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,tip={x:q.x-ux*0.18,y:q.y-uy*0.18},base={x:tip.x-ux*0.42,y:tip.y-uy*0.42};
    return '<line x1="'+p.x+'" y1="'+p.y+'" x2="'+base.x+'" y2="'+base.y+'" stroke="'+color+'" stroke-width="0.17" stroke-linecap="round"'+(dashed?' stroke-dasharray="0.25 0.18"':'')+'/>'+
      '<polygon points="'+tip.x+','+tip.y+' '+(base.x-uy*0.26)+','+(base.y+ux*0.26)+' '+(base.x+uy*0.26)+','+(base.y-ux*0.26)+'" fill="'+color+'"/>';
  }
  // How good the last move was: the evaluation before it (the best line then) against now, for the side that moved.
  function moveFeedback(){
    var prev=view.prev;if(!prev||!prev.line||!view.lines[0]||moves.length!==prev.moves+1||!last)return '';
    if(!view.done&&view.depth<8)return '';
    var played='abcdefgh'[last.from.c]+(8-last.from.r)+'abcdefgh'[last.to.c]+(8-last.to.r),mover=prev.turn,sign=mover==='white'?1:-1;
    if(prev.line.pv[0]===played)return '★ ตาที่ดีที่สุด (Best)';
    var loss=sign*whiteValue(prev.line.score,prev.turn)-sign*whiteValue(view.lines[0].score,state.turn);
    return loss<=0.3?'✓ ตาดี (Good)':loss<=1?'?! ไม่แม่น (Inaccuracy) · เสียไป '+loss.toFixed(1):loss<=2.5?'? พลาด (Mistake) · เสียไป '+loss.toFixed(1):'?? พลาดหนัก (Blunder) · เสียไป '+Math.min(loss,99).toFixed(1);
  }
  function drawAnalysis(){
    var on=analysis&&mode==='play',lines=view.lines,top=lines[0];drawTableMoves();
    $('analysisPanel').hidden=!on;$('bestMove').hidden=!on;$('bestMove').disabled=!top;
    $('arrowLayer').innerHTML='';
    if(!on)return;
    $('evalBar').hidden=!assist.bar;$('engineLines').hidden=!assist.lines;
    $('modeLabel').textContent='AI ระดับยาก'+(E&&E.tier()?' ('+(E.tier()==='lite'?'Lite':'Full')+')':'');
    var v=top?whiteValue(top.score,state.turn):0;
    $('evalFill').style.width=(top?(top.score.mate!==undefined?(v>0?100:0):50+50*Math.tanh(v/4)):50)+'%';
    $('evalText').textContent=view.table?view.table.summary+(view.table.local?' (ตาราง local)':' (ตาราง)'):top?scoreText(top.score,state.turn)+' · ลึก '+view.depth:(view.error||(engine.progress>0&&engine.progress<100?'กำลังโหลด AI ระดับยาก (Full) '+engine.progress+'%':'AI กำลังคิด…'));
    var list=$('engineLines');list.replaceChildren();list.classList.toggle('tableChips',!!view.table);
    // With an endgame table: every move as a chip in one row that scrolls sideways (best first), no second list.
    if(view.table)view.table.list.forEach(function(x,i){
      var li=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='tableChip '+x.kind+(i===0?' best':'');
      b.innerHTML='<b></b><span></span>';b.firstChild.textContent=chipLabel(x);b.lastChild.textContent=pvText([x.key],1).replace(/^\d+(\.|…)\s*/,'');
      b.title=x.kind==='draw'?x.why:x.kind==='win'?'รุกจนใน '+x.moves+' ตา':'โดนรุกจนใน '+x.moves+' ตา';
      b.addEventListener('click',function(){playMove(x.move.from,x.move.to);});
      li.appendChild(b);list.appendChild(li);
    });
    else if(view.error){var err=document.createElement('li');err.className='lineError';err.textContent=view.error;list.appendChild(err);}
    // Always two rows (empty while the AI thinks), so the panel keeps its height and the board never jumps.
    if(!view.error&&!view.table)[0,1].forEach(function(i){
      var l=lines[i],li=document.createElement('li'),b=document.createElement('button');b.type='button';b.disabled=!l;
      b.innerHTML='<span class="lineScore"></span><span class="linePv"></span>';
      b.firstChild.textContent=l?(view.table?tableLabel(view.table.list[i]):scoreText(l.score,state.turn)):'…';b.lastChild.textContent=l?pvText(l.pv,8):'';
      if(l)b.addEventListener('click',function(){var m=l.pv[0];if(m)playMove(square(m,0),square(m,2));});
      li.appendChild(b);list.appendChild(li);
    });
    // A selected piece: each of its squares shows what the table says (ชนะ / แพ้ in N, or =).
    if(view.table&&selected)view.table.list.forEach(function(x){
      if(!same(x.move.from,selected))return;var el=squareEl(x.move.to);if(!el)return;
      var tag=document.createElement('span');tag.className='tbBadge '+x.kind;tag.textContent=x.kind==='draw'?'=':(x.kind==='win'?'+':'-')+x.moves;el.appendChild(tag);
    });
    if(top&&assist.arrows&&top.pv[0])$('arrowLayer').innerHTML+=arrow(top.pv[0],'rgba(74,163,223,.88)');
    if(top&&assist.threats&&top.pv[1])$('arrowLayer').innerHTML+=arrow(top.pv[1],'rgba(216,52,44,.8)',true);
    // The last move's rating sits at the right of the evaluation bar (play mode shows no status line).
    var feedback=assist.feedback?moveFeedback():'',rating=$('moveRating');
    rating.hidden=!feedback;rating.textContent=feedback.replace(/ · เสียไป .*/,'');rating.title=feedback;
    rating.className='moveRating'+(/พลาดหนัก|Mistake|พลาด/.test(feedback)?' bad':/ไม่แม่น/.test(feedback)?' warn':' good');
  }
  // King + rook against a lone king: the endgame table (tablebase.js) gives every move's result at once, and the
  // count (ศักดิ์หมาก) decides whether a mate comes in time: a mate that needs more moves than the count leaves is a
  // draw. Each move: {move, key, kind: 'win'|'loss'|'draw', moves (the rook side's moves to mate, this one included
  // when it moves), why}.
  // Rook moves the count still allows from count c, with the lone king to move (loneNext) or the rook side to move.
  function movesLeft(c,loneNext){
    if(!c)return Infinity;if(c.draw)return 0;
    var said=c.value===null?c.start:c.value+1;
    return Math.max(0,c.ceiling-said+(loneNext?1:2));
  }
  function tableView(){
    var T=window.MakrukTablebase,o=T&&T.outcomes(state.pieces,state.turn);
    if(!o||playStatus().state!=='playing')return null;
    if(o.two)return twoSidedView(o,T);
    var mover=state.turn,strong=mover===o.strong;
    var list=o.moves.map(function(x){
      var key=moveKey(x.move),c=P.nextCount(count,x.after,mover),out={move:x.move,key:key};
      if(x.n===Infinity){out.kind='draw';out.why=strong?'เสียหมากหรืออับ':'กินหมากหรือหนีได้';return out;}
      var need=strong?x.n:x.n,left=movesLeft(c,strong);
      if(strong&&x.n===0){out.kind='win';out.moves=1;return out;}
      if(need>left){out.kind='draw';out.why='นับศักดิ์ครบก่อน (ต้องใช้ '+(strong?need+1:need)+' ตา)';return out;}
      out.kind=strong?'win':'loss';out.moves=strong?need+1:need;return out;
    });
    var rank=function(x){return strong?(x.kind==='win'?x.moves:1000):(x.kind==='draw'?-1000:-x.moves);};
    list.sort(function(a,b){return rank(a)-rank(b);});
    list.forEach(function(x){var reply=x.kind==='draw'?null:T.bestMove(R.applyMove(state.pieces,x.move.from,x.move.to),opponent(mover));x.reply=reply?moveKey(reply.move):null;});
    var best=list[0],rook=sideName(o.strong),lone=sideName(opponent(o.strong));
    var summary=!best?'':best.kind==='win'?rook+'ชนะ · รุกจนใน '+best.moves+' ตา':best.kind==='loss'?lone+'แพ้ใน '+best.moves+' ตา (ถ้า'+rook+'เดินดีที่สุด)':'เสมอ · '+(strong?(list.some(function(x){return /นับ/.test(x.why||'');})?rook+'รุกจนไม่ทันนับ':rook+'ไล่ไม่จน'):lone+'รอดได้');
    return {list:list,summary:summary,strong:strong};
  }
  // Pieces on both sides (tablebase/rs): either side may win. Each move: win (mate in n of the mover's moves, this one
  // included), loss (mated after n of the other side's moves) or draw; a mate the count (นับศักดิ์) cuts off is a draw.
  function twoSidedView(o,T){
    var mover=state.turn,opp=opponent(mover);
    var list=o.moves.map(function(x){
      var key=moveKey(x.move),out={move:x.move,key:key};
      if(x.res==='draw'){out.kind='draw';out.why='เสมอตามตาราง';return out;}
      var winner=x.res==='win'?mover:opp,c=P.nextCount(count,x.after,mover);
      var need=x.res==='win'?x.n-1:x.n,left=c&&c.counter!==winner?movesLeft(c,x.res==='win'):Infinity;
      if(need>left){out.kind='draw';out.why='นับศักดิ์ครบก่อน (ต้องใช้ '+x.n+' ตา)';return out;}
      out.kind=x.res;out.moves=x.n;return out;
    });
    var rank=function(x){return x.kind==='win'?x.moves:x.kind==='draw'?1000:2000-x.moves;};
    list.sort(function(a,b){return rank(a)-rank(b);});
    list.forEach(function(x){var reply=x.kind==='draw'?null:T.bestMove(R.applyMove(state.pieces,x.move.from,x.move.to),opp);x.reply=reply?moveKey(reply.move):null;});
    var best=list[0];
    var summary=!best?'':best.kind==='win'?sideName(mover)+'ชนะ · รุกจนใน '+best.moves+' ตา':best.kind==='loss'?sideName(mover)+'แพ้ใน '+best.moves+' ตา (ถ้า'+sideName(opp)+'เดินดีที่สุด)':'เสมอ · ทั้งสองฝ่ายเดินดีที่สุด';
    return {list:list,summary:summary,strong:true,local:!!o.local};
  }
  // The mate score of a table row from the mover's side: a win counts up, a loss down.
  function tableScore(x){return x.kind==='draw'?{cp:0}:{mate:x.kind==='win'?x.moves:-x.moves};}
  function chipLabel(x){return x.kind==='win'?'ชนะ '+x.moves:x.kind==='loss'?'แพ้ '+x.moves:/นับ/.test(x.why||'')?'เสมอ·นับ':'เสมอ';}
  function tableLabel(x){return x.kind==='win'?'ชนะ '+x.moves:x.kind==='loss'?'แพ้ '+x.moves:'เสมอ';}
  function drawTableMoves(){
    // The chips above the board list every move now; this list stays hidden (kept for wide screens if wanted).
    var box=$('tableMoves');box.hidden=true;return;
    $('tableSummary').textContent='ตารางปลายกระดาน · '+tb.summary+' · ดูผลทุกตาเดิน ('+tb.list.length+')';
    var ol=$('tableList');ol.replaceChildren();
    tb.list.forEach(function(x){
      var li=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='tableMove '+x.kind;
      b.innerHTML='<span class="tableKind"></span><span class="tableText"></span>';
      b.firstChild.textContent=tableLabel(x);
      b.lastChild.textContent=pvText([x.key],1)+(x.kind==='draw'?' · '+x.why:x.kind==='win'?' · รุกจนใน '+x.moves+' ตา':' · โดนรุกจนใน '+x.moves+' ตา');
      b.addEventListener('click',function(){playMove(x.move.from,x.move.to);});
      li.appendChild(b);ol.appendChild(li);
    });
  }
  function updateAnalysis(){
    if(!analysis)return;
    if(mode!=='play'){if(E)E.stopAnalysis();view.fen=null;drawAnalysis();return;}
    var fen=M.fen(state);
    if(fen!==view.fen){
      view.prev=view.fen?{line:view.lines[0],turn:view.turn,moves:view.moves}:null;
      view.fen=fen;view.turn=state.turn;view.moves=moves.length;view.lines=[];view.depth=0;view.done=false;
      view.table=tableView();
      if(!view.table&&window.MakrukTablebase&&MakrukTablebase.need(state.pieces,false,state.turn))MakrukTablebase.ensure(state.pieces,false,state.turn).then(function(ok){if(ok&&view.fen===fen){view.fen=null;render();}});
      if(view.table){
        if(E)E.stopAnalysis();view.error='';view.done=true;
        view.lines=view.table.list.slice(0,2).map(function(x){return {score:tableScore(x,view.table.strong),pv:x.reply?[x.key,x.reply]:[x.key]};});
      }
      else if(playStatus().state!=='playing'){if(E)E.stopAnalysis();}
      else if(!E){view.error='เปิด AI ไม่ได้';}
      else E.analyse(fen,function(u){if(view.fen!==fen||view.table)return;view.lines=u.lines;view.depth=u.depth;view.done=u.done;drawAnalysis();})
        .catch(function(e){view.error='AI ใช้ไม่ได้: '+((e&&e.reason)||'เบราว์เซอร์นี้ยังไม่รองรับ');drawAnalysis();});
    }
    drawAnalysis();
  }
  // Every render also refreshes the analysis and the options that depend on the mode.
  var baseRender=render;
  render=function(){
    baseRender();
    document.body.classList.toggle('analysisMode',analysis&&mode==='play');$('assistOptions').hidden=!analysis;$('analyse').hidden=analysis||mode!=='play'||!!(game&&game.ai);
    if(analysis)updateAnalysis();
    else if(!reviewing)$('arrowLayer').innerHTML=hintNow()&&hint.stage>1?arrow(moveKey(hint.move),'rgba(76,160,58,.9)'):'';
  };
  // Hint (games against the AI, on the player's turn): the first tap marks the piece the AI would move, the next tap
  // adds an arrow to its square. The engine searches the player's side up to depth 16 (1.5 s at most); without it the
  // player in makruk-play.js suggests. A move, an undo or a new game clears it.
  var hint=null;
  function hintNow(){return !!hint&&!!hint.move&&hint.fen===M.fen(state);}
  function canHint(){return !!game&&!!game.ai&&mode==='play'&&!reviewing&&!aiTurn()&&playStatus().state==='playing';}
  $('hint').addEventListener('click',function(){
    if(!canHint())return;
    var fen=M.fen(state);
    if(hint&&hint.fen===fen){if(hint.move){hint.stage=2;render();}return;}
    hint={fen:fen,stage:1,move:null};message('กำลังหาคำใบ้…');
    var found=function(move){if(!hint||hint.fen!==fen)return;if(!move){hint=null;message('ยังหาคำใบ้ไม่ได้ ลองอีกครั้ง');return;}hint.move=move;message('');render();};
    var simple=function(){found(P.chooseMove(state.pieces,state.turn,{count:count}));};
    var table=window.MakrukTablebase&&MakrukTablebase.bestMove(state.pieces,state.turn);
    if(table){found(table.move);return;}
    if(window.MakrukTablebase&&MakrukTablebase.need(state.pieces,false,state.turn))MakrukTablebase.ensure(state.pieces,false,state.turn);
    if(!engineAi()||engine.state!=='ready'){simple();return;}
    var since=moves.length;while(since>0&&moves[since-1].piece!=='pawn'&&!moves[since-1].capture)since--;
    E.bestMove(since?moves[since-1].fen:M.fen(trial.state),moves.slice(since).map(function(m){return m.uci;}),{depth:16,time:1500}).then(function(key){
      if(!hint||hint.fen!==fen)return;
      var move=key&&R.legalMoves(state.pieces,state.turn).find(function(m){return moveKey(m)===key;});
      if(move)found(move);else simple();
    },simple);
  });
  // Resign: the AI wins the game (counted as a finished game). Undo takes the resignation back.
  // Once the game is over (resigned, mated or drawn) the same button reads เริ่มใหม่ and opens the result again.
  $('resign').addEventListener('click',function(){
    if(!game||!game.ai||mode!=='play')return;
    if(playStatus().state!=='playing'){showResult();return;}
    $('resignDialog').showModal();
  });
  $('resignCancel').onclick=function(){$('resignDialog').close();};
  $('resignConfirm').onclick=function(){
    $('resignDialog').close();
    if(!game||!game.ai||mode!=='play'||playStatus().state!=='playing')return;
    cancelAi();hint=null;game.resigned=true;render();sound.playResult('failure');recordGame({winner:aiSide()});showResult();
  };
  $('newGameCancel').onclick=function(){$('newGameDialog').close();};
  function newGame(side){
    $('newGameDialog').close();if($('resultDialog').open)$('resultDialog').close();stopReview();
    cancelAi();hint=null;game.human=side;pickShape();game.bookDone=false;game.recorded=false;game.resigned=false;flipped=side==='black';
    try{var url=new URL(location.href);url.searchParams.set('side',side);window.history.replaceState(null,'',url);}catch(e){}
    state=M.initial();trial={state:clone(state),history:[],future:[]};history=[];future=[];moves=[];selected=null;last=null;startCount();render();scheduleAi();
  }
  $('newGameBtn').onclick=function(){$('newGameDialog').showModal();};
  $('topNewGame').onclick=function(){$('newGameDialog').showModal();};
  $('newWhite').onclick=function(){newGame('white');};
  $('newBlack').onclick=function(){newGame('black');};

  // Result of a game against the AI: who won and how, a word from the coach, and a game review that rates each of the
  // player's moves by how much it lost against the best move: ดีเยี่ยม = the best move or within 0.3 pawn ·
  // ดี = within 1.2 pawns · ผิดพลาด = more. To be quick on any device:
  //   - while the game goes on, the player's positions are searched in the background on the player's turn
  //     (PONDER limits) and the AI's own searches are kept (reviewCache, by position), so most are known at the end;
  //   - a move with no other choice is not rated; an endgame table position is rated from the table, exactly;
  //   - the position after a move is searched only when the move was not the engine's best;
  //   - what is still missing shares about REVIEW_BUDGET ms (each search 0.1–0.6 s, REVIEW_DEPTH plies at most).
  var REVIEW_BUDGET=20000,review=null,reviewCache=new Map(),pondering=null;
  var RESULT_REASON={checkmate:'ด้วยการรุกจน',resign:'คุณยอมแพ้',stalemate:'อับ · ฝ่ายที่ต้องเดินไม่มีตาเดิน',draw:'เหลือขุนเปล่าทั้งสองฝ่าย',countdraw:'นับครบศักดิ์',repetition:'เดินซ้ำตำแหน่งเดิม 3 ครั้ง'};
  function liteEngine(){return !!E&&E.tier()==='lite';}
  function reviewDepth(){return liteEngine()?10:14;}
  var PONDER={full:{depth:14,time:500},lite:{depth:10,time:300}};
  function keepReview(fen,r){if(r&&r.score&&(r.depth||0)>=6&&!reviewCache.has(fen))reviewCache.set(fen,{value:reviewValue(r),best:r.best||null,depth:r.depth||0});}
  // On the player's turn the engine is free: search this position for the review (stopped when the player moves).
  function ponder(){
    if(!game||!game.ai||mode!=='play'||aiTurn()||future.length||playStatus().state!=='playing'||!engineAi()||engine.state!=='ready'||!E.evaluate)return;
    var fen=M.fen(state);
    if(reviewCache.has(fen)||pondering===fen)return;
    pondering=fen;
    E.evaluate(fen,PONDER[liteEngine()?'lite':'full']).then(function(r){if(pondering===fen)pondering=null;keepReview(fen,r);},function(){if(pondering===fen)pondering=null;});
  }
  // The AI's own search of the position it moved from (deep enough to be worth keeping).
  function keepAiSearch(fen){var s=E&&E.lastSearch&&E.lastSearch();if(s&&s.score&&s.depth>=8)keepReview(fen,s);}
  function showResult(){
    var status=playStatus();if(!game||!game.ai||status.state==='playing')return;
    var won=status.winner===game.human,lost=!!status.winner&&!won,level={easy:'ง่าย',medium:'กลาง',hard:'ยาก'}[game.level];
    $('resultTitle').textContent=won?'คุณชนะ!':lost?'AI ชนะ':'เสมอ';
    $('resultTitle').className=won?'win':lost?'loss':'drawn';
    $('resultReason').textContent=RESULT_REASON[status.state]||'';
    $('resultSpeech').textContent=won?'เยี่ยมมาก! คุณชนะ AI ระดับ'+level+' ลองดูว่าตาไหนที่เดินได้ดีที่สุด แล้วลองระดับที่ยากขึ้น':
      status.state==='resign'?'ยอมแพ้ไม่ใช่เรื่องผิด รู้ตัวว่าเสียเปรียบก็เป็นทักษะหนึ่ง ลองดูว่าเริ่มพลาดตั้งแต่ตาไหน เกมหน้าจะเตรียมตัวได้ดีขึ้น':
      lost?'แพ้ไม่เป็นไร ทุกเกมคือบทเรียน ลองดูตาที่พลาด แล้วเกมหน้าจะเล่นได้ดีขึ้นแน่นอน':
      'เสมอกับ AI ระดับ'+level+' ก็เก่งแล้ว ลองดูว่ามีตาไหนที่จะเล่นให้ชนะได้';
    if(!review||review.length!==fullLine().length)startReview();else drawReview();
    if(!$('resultDialog').open){
      if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('resultDialog').showModal();
      else setTimeout(function(){if(playStatus().state!=='playing'&&!$('resultDialog').open)$('resultDialog').showModal();},status.state==='resign'?0:700);
    }
  }
  function stopReview(){if(review)review.stopped=true;review=null;if(reviewing){putCoachBack();reviewing=false;document.body.classList.remove('reviewMode');$('gameReview').hidden=true;$('analysisPanel').hidden=true;$('arrowLayer').innerHTML='';}}
  function reviewValue(r){
    if(!r||!r.score)return 0;
    return r.score.mate!==undefined?(r.score.mate>0?10000-r.score.mate:-10000-r.score.mate):r.score.cp;
  }
  // A move rated from an endgame table: the best result there was against the one the move kept.
  var TABLE_WORD={win:'ชนะ',draw:'เสมอ',loss:'แพ้'};
  function rateFromTable(job,i,o){
    var side=job.line[i].side;
    var results=o.moves.map(function(x){
      if(o.two)return {move:x.move,res:x.res,n:x.n};
      if(x.n===Infinity)return {move:x.move,res:'draw',n:0};
      return side===o.strong?{move:x.move,res:'win',n:x.n+1}:{move:x.move,res:'loss',n:x.n};
    });
    var score=function(r){return r.res==='win'?10000-r.n:r.res==='loss'?-10000+r.n:0;};
    var best=results.reduce(function(a,b){return score(b)>score(a)?b:a;});
    var m=job.line[i],played=results.find(function(r){return moveKey(r.move)===m.uci;});
    if(!played)return false;
    var kind=score(played)===score(best)?'best':played.res===best.res?'good':'mistake',better=null;
    if(kind==='mistake'){try{better=N.formatMove(M.parse(job.fens[i]).pieces,best.move.from,best.move.to).text;}catch(e){}}
    job.rated.push({i:i,kind:kind,loss:0,better:better,bestKey:kind==='best'?null:moveKey(best.move),note:kind==='mistake'?'ตารางท้ายเกม: '+TABLE_WORD[best.res]+' → '+TABLE_WORD[played.res]:''});
    job.vals[i]=score(best);job.vals[i+1]=-score(played);
    return true;
  }
  function startReview(){
    stopReview();
    var line=fullLine().slice(),job={length:line.length,line:line,fens:[M.fen(trial.state)].concat(line.map(function(m){return m.fen;})),rated:[],forced:{},vals:{},done:0,total:0,stopped:false,error:''};
    review=job;
    var mine=line.map(function(m,i){return m.side===game.human?i:-1;}).filter(function(i){return i>=0;});
    job.total=mine.length;
    var T=window.MakrukTablebase,queue=[];
    var terminal=function(at){var p=M.parse(job.fens[at]),st=R.gameStatus(p.pieces,p.turn);return st.state==='checkmate'?-10000:st.state!=='playing'?0:null;};
    job.fens.forEach(function(f,at){var t=terminal(at);if(t!==null)job.vals[at]=t;});
    mine.forEach(function(i){
      var parsed=M.parse(job.fens[i]);
      if(R.legalMoves(parsed.pieces,parsed.turn).length<=1){job.forced[i]=true;job.done++;return;} // no choice: not rated
      var o=T&&T.outcomes(parsed.pieces,parsed.turn);
      if(o&&o.moves.length&&rateFromTable(job,i,o)){job.done++;return;}
      queue.push(i);
    });
    var known=function(at){return reviewCache.has(job.fens[at]);};
    if(queue.length&&(!E||E.unsupported()||engine.state==='failed')){job.error='เครื่องนี้ใช้ AI วิเคราะห์เกมไม่ได้ (ให้คะแนนเฉพาะตาที่ตารางท้ายเกมรู้ผล)';drawReview();return;}
    // Time for each search still to make: the budget shared over what is missing (the position after a move only
    // counts when the move was not the known best).
    var missing=queue.reduce(function(n,i){var c=reviewCache.get(job.fens[i]);return n+(c?0:1)+(c&&c.best===line[i].uci||known(i+1)?0:1);},0);
    var limits={depth:reviewDepth(),time:Math.max(100,Math.min(600,Math.round(REVIEW_BUDGET/Math.max(1,missing))))};
    job.depth=limits.depth;
    var value=function(at){
      if(job.vals[at]!==undefined&&terminal(at)!==null)return Promise.resolve({value:job.vals[at],best:null});
      if(known(at))return Promise.resolve(reviewCache.get(job.fens[at]));
      return E.evaluate(job.fens[at],limits).then(function(r){keepReview(job.fens[at],r);return reviewCache.get(job.fens[at])||{value:reviewValue(r),best:r.best};});
    };
    var clamp=function(v){return Math.max(-1000,Math.min(1000,v));};
    var step=function(k){
      if(job.stopped)return;
      if(k>=queue.length){drawReview();return;}
      var i=queue[k];
      value(i).then(function(a){
        if(job.stopped)return;
        job.vals[i]=a.value;
        // The engine's own move: the position after it is worth what this one was (seen from the other side).
        if(a.best===line[i].uci){if(job.vals[i+1]===undefined&&!known(i+1))job.vals[i+1]=-a.value;job.rated.push({i:i,kind:'best',loss:0,better:null});job.done++;drawReview();step(k+1);return;}
        return value(i+1).then(function(b){
          if(job.stopped)return;
          job.vals[i+1]=b.value;
          var loss=Math.max(0,clamp(a.value)-clamp(-b.value));
          var kind=loss<=30?'best':loss<=120?'good':'mistake',better=null;
          if(kind==='mistake'&&a.best){try{better=N.formatMove(M.parse(job.fens[i]).pieces,square(a.best,0),square(a.best,2)).text;}catch(e){}}
          job.rated.push({i:i,kind:kind,loss:loss,better:better,bestKey:kind==='best'?null:a.best});job.done++;drawReview();step(k+1);
        });
      }).catch(function(){if(job.stopped)return;job.error='AI วิเคราะห์ไม่สำเร็จ';drawReview();});
    };
    drawReview();step(0);
  }
  function drawReview(){
    var job=review;if(!job)return;
    var countOf=function(kind){return job.rated.filter(function(r){return r.kind===kind;}).length;};
    var finished=!job.error&&job.done>=job.total;
    $('statBest').textContent=countOf('best');$('statGood').textContent=countOf('good');$('statMistake').textContent=countOf('mistake');
    $('reviewProgress').hidden=finished&&!job.error;
    $('reviewBar').style.width=(job.total?Math.round(job.done/job.total*100):100)+'%';
    $('reviewText').textContent=job.error||(job.total?'AI กำลังวิเคราะห์ตาเดิน '+job.done+'/'+job.total+' ตา (ลึก '+(job.depth||reviewDepth())+' ชั้น)':'ยังไม่มีตาเดินของคุณให้วิเคราะห์');
    $('reviewBtn').disabled=!job.line.length;
    drawResultGraph();
    if(reviewing){renderMoves();drawGameReview();}
  }

  // Game Review screen (★ Game Review in the result): the game is stepped through on the board (ย้อนกลับ / เดินหน้า,
  // the buttons under the graph, the move record, or a tap on the graph), with an evaluation bar for the position,
  // a graph of who was better over the whole game, the rating of each of the player's moves in the record and what
  // the coach says about the move just played (the better move as a green arrow after a mistake).
  var reviewing=false;
  var KIND_TEXT={best:'★ ดีเยี่ยม',good:'👍 ดี',mistake:'? ผิดพลาด'};
  function ratingOf(i){return review&&review.rated.find(function(r){return r.i===i;});}
  // Each position's evaluation for white (cp, a mate as ±10000 less its moves); a position not searched keeps the one
  // before it.
  function reviewEvals(){
    var job=review,out=[],prev=0;
    job.fens.forEach(function(f,at){
      var v=job.vals[at];if(v===undefined){var c=reviewCache.get(f);if(c)v=c.value;}
      if(v===undefined){out.push({v:prev,known:false});return;}
      var w=f.split(' ')[1]==='w'?v:-v;prev=w;out.push({v:w,known:true});
    });
    return out;
  }
  function evalLabel(v){return Math.abs(v)>=9000?(v>0?'+':'-')+'M'+(10000-Math.abs(v)):(v>=0?'+':'')+(v/100).toFixed(1);}
  function evalHeight(v){return Math.abs(v)>=9000?(v>0?1:-1):Math.tanh(v/400);}
  function openReview(ply){
    if(!review||review.length!==fullLine().length)startReview();
    if($('resultDialog').open)$('resultDialog').close();
    cancelAi();reviewing=true;document.body.classList.add('reviewMode');$('gameReview').hidden=false;
    // The coach's words go to the top, above the board, in large type; the evaluation is a thin upright bar beside
    // the board with just its number (like the board apps), so the board stays as large as in the game.
    var coach=$('gameReview').querySelector('.grCoach');
    if(!coachHome){coachHome=document.createComment('grCoach');coach.before(coachHome);}
    // On the /ai page it takes the progress bar's place in the header, which keeps one height, so the board never moves.
    if(game&&game.standalone)$('thinkBar').after(coach);else document.querySelector('.boardArea').prepend(coach);$('evalV').hidden=false;
    jumpTo(ply===undefined?0:ply);
  }
  function closeReview(){var end=fullLine().length;stopReviewView();jumpTo(end);}
  var coachHome=null;
  function putCoachBack(){if(coachHome)coachHome.after(document.querySelector('.grCoach'));$('evalV').hidden=true;}
  function stopReviewView(){putCoachBack();reviewing=false;document.body.classList.remove('reviewMode');$('gameReview').hidden=true;$('analysisPanel').hidden=true;$('arrowLayer').innerHTML='';render();}
  // Why a move of the player's was good or not, from the board itself: what it took, a check, a piece it saved, and
  // after a mistake the opponent's strongest reply (the threat, a red arrow) and what the better move did.
  function explainMove(job,i,r,fallback){
    var out={good:'',threat:'',better:'',threatKey:null},m=job.line[i],me=m.side,them=me==='white'?'black':'white';
    var at=function(pieces,s){return pieces.find(function(p){return same(p.at,s);});};
    var facts=function(pieces,key){
      var from=square(key,0),to=square(key,2),mover=at(pieces,from),took=at(pieces,to),after=R.applyMove(pieces,from,to),st=R.gameStatus(after,mover.side==='white'?'black':'white');
      return {mover:mover,took:took,mate:st.state==='checkmate',check:st.check,after:after,from:from,to:to};
    };
    try{
      var before=M.parse(job.fens[i]).pieces,f=facts(before,m.uci),bits=[];
      if(f.mate)bits.push('รุกจน!');else{
        if(f.took)bits.push('กิน'+names[f.took.piece]+'ได้');
        if(f.check)bits.push('รุกขุน');
        if(!f.took&&f.mover.piece!=='king'&&R.isAttacked(before,f.from,them)&&!R.isAttacked(f.after,f.to,them))bits.push('พา'+names[f.mover.piece]+'หนีจากการถูกโจมตี');
      }
      out.good=bits.join(' และ ');
      if(!r||r.kind==='best'&&!fallback)return out;
      var c=reviewCache.get(job.fens[i+1]),key=c&&c.best||fallback;
      if(key){
        // Plain words for children and beginners: "ของเรา", the AI's piece by its square, the arrow to look at.
        var t=facts(f.after,key),text=N.formatMove(f.after,t.from,t.to).text,piece=text.split(/ [-×] /)[0];
        out.threatKey=key;
        out.threat=t.mate?'ระวัง! AI จะเดิน '+text+' รุกจน (ดูลูกศรแดง)':t.took?'ระวัง! AI จะเอา '+piece+' กิน'+names[t.took.piece]+'ของเรา (ดูลูกศรแดง)':t.check?'ระวัง! AI จะเดิน '+text+' รุกขุนของเรา (ดูลูกศรแดง)':
          r.kind==='mistake'?'AI จะเดิน '+text+' แล้วได้เปรียบ (ดูลูกศรแดง)':'AI น่าจะเดิน '+text+' ต่อ (ดูลูกศรแดง)';
      }
      if(r.kind!=='best'&&r.bestKey){
        var b=facts(before,r.bestKey);
        out.better=b.mate?'รุกจนได้':b.took?'กิน'+names[b.took.piece]+'ได้':b.check?'รุกขุน':key&&same(b.from,square(key,2))?'พา'+names[b.mover.piece]+'หนี':'';
      }
    }catch(e){}
    return out;
  }
  // Praise for a best move, in a few wordings so the review reads naturally (chosen by the move, so stepping back and
  // forth shows the same words).
  var BEST_SAY=['ดีเยี่ยม! เลือกแต้มได้ดีมาก','เก่งมาก! ตานี้เดินได้แม่นยำ','ยอดเยี่ยม! อ่านเกมได้ขาดจริง ๆ','สุดยอด! แต้มแบบนี้แหละที่เซียนเลือก','เยี่ยมไปเลย! เดินได้ถูกจังหวะ รักษาความได้เปรียบไว้ได้'];
  var BEST_HEAD=['ดีเยี่ยม! ','เก่งมาก! ','ยอดเยี่ยม! ','สุดยอด! ','เยี่ยมไปเลย! '];
  var reviewShow={at:-1,threat:false,best:false};
  // /ai: the game's moves in one row (ตาเลข, then white's and red's move); the shown one is marked and kept in view, a
  // tap goes to it.
  function drawMoveStrip(line,n,job,ids){
    ids=ids||['grMoves','grStripPrev','grStripNext'];
    var box=$(ids[0]),first=trial.state.turn,html='';
    line.forEach(function(m,k){
      var no=Math.floor((k+(first==='white'?0:1))/2)+1,q=ratingOf(k);
      if(m.side==='white'||k===0)html+='<span class="grNo">'+no+'.</span>';
      html+='<button type="button" data-ply="'+(k+1)+'" class="grMv'+(k+1===n?' now':'')+(m.side===game.human?' mine':'')+(q?' '+q.kind:'')+'">'+m.text.replace(/ /g,'')+'</button>';
    });
    if(box.dataset.html!==html){box.innerHTML=html;box.dataset.html=html;}
    var cur=box.querySelector('.now');
    if(cur)box.scrollLeft=Math.max(0,cur.offsetLeft-box.clientWidth/2+cur.offsetWidth/2);else if(!n)box.scrollLeft=0;
    $(ids[1]).disabled=n<=0;$(ids[2]).disabled=n>=line.length;
  }
  // ถัดไป: the next of the player's moves where the game turned: a mistake, or the evaluation swinging by 1.5 points or
  // more over that move and the reply before it (from the first again after the last).
  function keyMoments(){
    var job=review,line=fullLine(),evals=reviewEvals(),c=function(v){return Math.max(-1000,Math.min(1000,v));},out=[];
    line.forEach(function(m,k){
      if(m.side!==game.human)return;
      var p=k+1,q=ratingOf(k),swing=Math.abs(c(evals[Math.min(p,evals.length-1)].v)-c(evals[Math.max(0,p-2)].v));
      if(q&&q.kind==='mistake'||swing>=150)out.push(p);
    });
    return out;
  }
  function drawGameReview(){
    var job=review;if(!reviewing||!job)return;
    var line=fullLine(),n=moves.length,total=line.length,evals=reviewEvals(),now=evals[Math.min(n,evals.length-1)];
    message('');
    $('modeLabel').textContent='วิเคราะห์การเดิน';
    // Evaluation bar (the analysis bar, without engine lines) and the rating of the move just played.
    $('analysisPanel').hidden=true;
    var share=50+50*evalHeight(now.v);$('evalVFill').style.height=share+'%';$('evalV').classList.toggle('flipped',flipped);
    $('evalVText').textContent=now.known?evalLabel(now.v).replace(/^\+/,''):'…';$('evalV').classList.toggle('redAhead',now.known&&now.v<0);
    var r=n>0&&ratingOf(n-1),rating=$('moveRating');
    rating.hidden=!r;if(r){rating.textContent=KIND_TEXT[r.kind];rating.className='moveRating'+(r.kind==='mistake'?' bad':' good');}
    var mine=n>0&&line[n-1].side===game.human,solo=game.standalone;
    var why=mine?explainMove(job,n-1,r,solo&&n<total?line[n].uci:null):null;
    if(solo){
      // /ai: the arrows wait for อันตราย (the AI's strongest reply, else its real one) and การเดินที่ดี (the better move), so
      // the player can think first; both close again on another position.
      if(reviewShow.at!==n)reviewShow={at:n,threat:false,best:false};
      var arrows='';
      if(reviewShow.threat&&why&&why.threatKey)arrows+=arrow(why.threatKey,'rgba(222,62,48,.92)',false);
      if(reviewShow.best&&r&&r.kind!=='best'&&r.bestKey)arrows+=arrow(r.bestKey,'rgba(87,190,90,.9)',true);
      $('arrowLayer').innerHTML=arrows;
      $('grThreat').disabled=!mine||!why||!why.threatKey;$('grBest').disabled=!mine||!r;
      $('grThreat').setAttribute('aria-pressed',String(reviewShow.threat));$('grBest').setAttribute('aria-pressed',String(reviewShow.best));
    }else $('arrowLayer').innerHTML=(why&&why.threatKey?arrow(why.threatKey,'rgba(222,62,48,.92)',false):'')+(r&&r.kind==='mistake'&&r.bestKey?arrow(r.bestKey,'rgba(87,190,90,.9)',true):'');
    // What the coach says about the move just played. A loss is in คะแนน (the evaluation bar's unit), not เบี้ย, since
    // the move may cost any piece or just position.
    var say;
    if(!n)say=game.standalone?'มาดูเกมนี้กัน! กด › เพื่อดูทีละตาของคุณ หรือ ถัดไป เพื่อไปจุดที่เกมเปลี่ยน':'มาดูเกมนี้กัน! กด ▶ เพื่อดูทีละตา แตะตาในบันทึก หรือแตะบนกราฟเพื่อไปตานั้น';
    else{
      var m=line[n-1],no=Math.floor((n-1+(trial.state.turn==='white'?0:1))/2)+1,head='ตา '+no+' ';
      // On /ai only the player's moves are explained (the steps skip the AI's); its last move just ends the game.
      if(m.side!==game.human)say=game.standalone&&n===total?'ตำแหน่งสุดท้ายของเกม · AI เดิน '+m.text:head+'AI เดิน '+m.text;
      else if(r)say=head+'คุณเดิน '+m.text+' · '+(r.kind==='best'?(why.good?BEST_HEAD[(n-1)%BEST_HEAD.length]+why.good:BEST_SAY[Math.floor((n-1)/2)%BEST_SAY.length]):r.kind==='good'?'ดี'+(why.good?' '+why.good:'')+' แต่เสียความได้เปรียบไปเล็กน้อย'+(r.loss?' ('+(r.loss/100).toFixed(1)+' คะแนน)':''):'ผิดพลาด '+(r.note||(r.loss>=1500?'เสียความได้เปรียบไปมาก':'เสียความได้เปรียบไป '+(r.loss/100).toFixed(1)+' คะแนน'))+(why.threat?' · '+why.threat:'')+(r.better?' · ควรเดิน '+r.better+(why.better?' '+why.better:'')+' (ลูกศรเขียว)':''));
      else if(job.forced[n-1])say=head+'คุณเดิน '+m.text+' · มีทางเดินทางเดียว';
      else say=head+'คุณเดิน '+m.text+' · '+(job.error||'AI กำลังวิเคราะห์ตานี้…');
    }
    if(solo&&mine&&r){
      // /ai: the verdict first; the reasons come with the two buttons.
      if(r.kind==='mistake')say=head+'คุณเดิน '+m.text+' · '+(r.note||(r.loss>=1500?'ตานี้พลาด เสียเปรียบไปมาก':(r.loss<300?'ตานี้พลาดไปนิด':'ตานี้พลาด')+' เสียไป '+(r.loss/100).toFixed(1)+' คะแนน'));
      var extra=[];
      if(reviewShow.threat&&why.threat)extra.push(why.threat);
      if(reviewShow.best)extra.push(r.kind==='best'?'ตานี้เดินดีที่สุดแล้ว เก่งมาก!':r.better?'ถ้าเดิน '+r.better+' จะดีกว่านะ'+(why.better?' '+why.better:'')+' (ดูลูกศรเขียว)':'ยังไม่มีแต้มที่ดีกว่าให้ดู');
      if(extra.length)say=head+'คุณเดิน '+m.text+' · '+extra.join(' · ');
      else if(r.kind==='mistake')say+=' · ลองกด "อันตราย" หรือ "การเดินที่ดี" ดูนะ';
    }
    $('grSpeech').textContent=say;
    if(solo)drawMoveStrip(line,n,job);
    var count=function(kind){return job.rated.filter(function(x){return x.kind===kind;}).length;};
    $('grStats').innerHTML='<span class="grChip best">★ '+count('best')+'</span><span class="grChip good">👍 '+count('good')+'</span><span class="grChip mistake">? '+count('mistake')+'</span>'+(job.done<job.total&&!job.error?'<span class="grBusy">วิเคราะห์ '+job.done+'/'+job.total+'</span>':'');
    // The graph: white's share from the bottom, the mistakes as orange dots, the shown position as a line.
    var x=function(k){return total?k/total*100:0;},y=function(v){return 50-48*evalHeight(v);};
    $('grPath').setAttribute('d','M0,100 '+evals.map(function(e,k){return 'L'+x(k).toFixed(2)+','+y(e.v).toFixed(2);}).join(' ')+' L100,100 Z');
    $('grMarks').innerHTML=job.rated.filter(function(q){return q.kind==='mistake';}).map(function(q){var e=evals[q.i+1];return '<circle cx="'+x(q.i+1)+'%" cy="'+y(e.v)+'%" r="4"/>';}).join('')+
      '<line class="grNow" x1="'+x(n)+'%" x2="'+x(n)+'%" y1="0" y2="100%"/>';
    $('grFirst').disabled=$('grPrev').disabled=n<=0;$('grNext').disabled=$('grLast').disabled=n>=total;
    $('grMistake').disabled=!job.rated.some(function(q){return q.kind==='mistake';});
  }
  // The same graph in the result (with the counts): the whole game, the mistakes as dots; a tap opens the review there.
  function drawResultGraph(){
    var job=review;if(!job)return;
    var total=job.line.length,evals=reviewEvals(),x=function(k){return total?k/total*100:0;},y=function(v){return 50-48*evalHeight(v);};
    $('rdGraph').hidden=!total;
    $('rdPath').setAttribute('d','M0,100 '+evals.map(function(e,k){return 'L'+x(k).toFixed(2)+','+y(e.v).toFixed(2);}).join(' ')+' L100,100 Z');
    $('rdMarks').innerHTML=job.rated.filter(function(q){return q.kind==='mistake';}).map(function(q){var e=evals[q.i+1];return '<circle cx="'+x(q.i+1)+'%" cy="'+y(e.v)+'%" r="4"/>';}).join('');
  }
  $('rdGraph').addEventListener('click',function(e){var box=$('rdGraph').getBoundingClientRect(),total=review?review.line.length:0;openReview(Math.max(0,Math.min(total,Math.round((e.clientX-box.left)/box.width*total))));});
  // In the review the graph stays folded away (the board as large as in the game); the กราฟ button shows it.
  var showGraph=false;try{showGraph=localStorage.getItem('makrukReviewGraph')==='1';}catch(e){}
  function applyGraph(){$('gameReview').classList.toggle('graphHidden',!showGraph);$('grGraphToggle').setAttribute('aria-pressed',String(showGraph));scheduleFit();}
  $('grGraphToggle').onclick=function(){showGraph=!showGraph;try{localStorage.setItem('makrukReviewGraph',showGraph?'1':'0');}catch(e){}applyGraph();};
  applyGraph();
  // On /ai the steps go from one of the player's moves to the next (the AI's replies are passed over), plus the start
  // and the end of the game.
  function reviewStep(d){
    var line=fullLine(),n=moves.length,to=n+d;
    if(game&&game.standalone)while(to>0&&to<line.length&&line[to-1].side!==game.human)to+=d;
    jumpTo(Math.max(0,Math.min(line.length,to)));
  }
  $('grFirst').onclick=function(){jumpTo(0);};$('grLast').onclick=function(){jumpTo(fullLine().length);};
  repeatButton($('grPrev'),function(){reviewStep(-1);});repeatButton($('grNext'),function(){reviewStep(1);});
  // The next mistake after the shown position (from the first one again after the last).
  $('grMistake').onclick=function(){
    var list=review.rated.filter(function(q){return q.kind==='mistake';}).map(function(q){return q.i+1;}).sort(function(a,b){return a-b;});
    var next=list.find(function(p){return p>moves.length;});if(next===undefined)next=list[0];if(next!==undefined)jumpTo(next);
  };
  $('grClose').onclick=closeReview;
  repeatButton($('grStripPrev'),function(){reviewStep(-1);});repeatButton($('grStripNext'),function(){reviewStep(1);});
  $('grMoves').addEventListener('click',function(e){var b=e.target.closest('[data-ply]');if(b)jumpTo(Number(b.dataset.ply));});
  repeatButton($('psPrev'),function(){jumpTo(Math.max(0,moves.length-1));});repeatButton($('psNext'),function(){jumpTo(Math.min(fullLine().length,moves.length+1));});
  $('psMoves').addEventListener('click',function(e){var b=e.target.closest('[data-ply]');if(b)jumpTo(Number(b.dataset.ply));});
  $('grThreat').onclick=function(){reviewShow.threat=!reviewShow.threat;drawGameReview();};
  $('grBest').onclick=function(){reviewShow.best=!reviewShow.best;drawGameReview();};
  $('grKey').onclick=function(){
    var list=keyMoments(),n=moves.length,next=list.find(function(p){return p>n;});
    if(next===undefined)next=list[0];
    if(next===undefined||next===n)reviewStep(1);else jumpTo(next);
  };
  $('grGraph').addEventListener('click',function(e){var box=$('grGraph').getBoundingClientRect(),total=fullLine().length;jumpTo(Math.max(0,Math.min(total,Math.round((e.clientX-box.left)/box.width*total))));});
  $('grGraph').addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();reviewStep(e.key==='ArrowLeft'?-1:1);}});
  $('reviewBtn').onclick=function(){openReview(0);};
  $('openReview').onclick=function(){openReview(0);};
  $('resultClose').onclick=function(){$('resultDialog').close();};
  $('resultNew').onclick=function(){$('resultDialog').close();$('newGameDialog').showModal();};
  $('resultRematch').onclick=function(){newGame(game.human);};
  document.querySelectorAll('[data-assist]').forEach(function(box){
    box.checked=assist[box.dataset.assist];
    box.addEventListener('change',function(){assist[box.dataset.assist]=box.checked;try{localStorage.setItem('makrukAssist',JSON.stringify(assist));}catch(e){}drawAnalysis();scheduleFit();});
  });
  $('bestMove').addEventListener('click',function(){var top=view.lines[0];if(top&&top.pv[0])playMove(square(top.pv[0],0),square(top.pv[0],2));});
  $('analyse').addEventListener('click',function(){location.href='editor.html?analysis=1#fen='+encodeURIComponent(M.fen(state))+(flipped?'&flip=1':'');});
  function label(at){return files[at.c]+(8-at.r);}
  function asset(p){return 'assets/pieces/makruk/ada/'+window.MakrukPieceColors.prefix(p.side)+icons[p.piece]+'.svg';}
  function clone(s){return {pieces:R.clonePieces(s.pieces),turn:s.turn};}
  function save(){if(mode!=='edit')return;try{localStorage.setItem(storageKey,M.fen(state));storageOK=true;}catch(e){storageOK=false;}}
  function snapshot(){return {state:clone(state),moves:moves.slice(),last:last,count:count};}
  function restore(item){state=item.state;moves=item.moves;last=item.last;count=item.count||null;selected=null;save();render();}
  function remember(){future=[];history.push(snapshot());if(history.length>200)history.shift();}
  function message(text,error){$('status').textContent=text;$('status').classList.toggle('error',!!error);document.querySelector('.positionFeedback').classList.toggle('hasStatus',!!text);scheduleFit();}
  function changed(){selected=null;last=null;save();render();}
  function chooseTool(value){tool=value;selected=null;render();}
  function pieceAt(at){return state.pieces.find(function(p){return same(p.at,at);});}
  function palette(id,side){
    Object.keys(names).forEach(function(piece){
      var button=document.createElement('button');button.type='button';button.dataset.tool=side+':'+piece;
      button.setAttribute('aria-label',names[piece]+sideName(side));button.setAttribute('aria-pressed','false');
      var img=document.createElement('img');img.src=asset({piece:piece,side:side});img.alt='';img.draggable=false;
      button.appendChild(img);button.appendChild(document.createTextNode(names[piece]));
      button.addEventListener('click',function(){if(suppressClick)return;chooseTool(button.dataset.tool);});
      button.addEventListener('pointerdown',function(e){beginDrag(e,{spec:button.dataset.tool,piece:{piece:piece,side:side}});});$(id).appendChild(button);
    });
  }
  function trayTool(id,value,icon,text){
    var button=document.createElement('button');button.type='button';button.dataset.tool=value;button.className='trayTool';
    button.setAttribute('aria-label',text);button.setAttribute('aria-pressed','false');
    var mark=document.createElement('span');mark.className='trayToolIcon';mark.setAttribute('aria-hidden','true');mark.textContent=icon;
    button.appendChild(mark);button.appendChild(document.createTextNode(text));
    button.addEventListener('click',function(){chooseTool(value);});$(id).appendChild(button);
  }
  palette('whitePalette','white');trayTool('whitePalette','move','✋','ย้าย');
  palette('redPalette','black');trayTool('redPalette','erase','🗑','ลบ');
  function render(){
    sound.clearMotion();
    document.body.dataset.mode=mode;$('setupOptions').hidden=mode!=='edit';$('clear').hidden=mode!=='edit';$('initial').hidden=mode!=='edit';$('redo').hidden=mode==='edit';$('start').hidden=mode!=='edit';$('restart').hidden=mode!=='play';$('edit').hidden=mode!=='play'||!!game;$('restart').textContent=game?'↺ เริ่มเกมใหม่':'↺ เริ่มทดลองใหม่';
    $('board').replaceChildren();
    var destinations=mode==='play'&&selected?R.legalDestinations(state.pieces,selected):[];
    var status=mode==='play'?playStatus():null;
    for(var rr=0;rr<8;rr++)for(var cc=0;cc<8;cc++){
      var r=flipped?7-rr:rr,c=flipped?7-cc:cc,at={r:r,c:c};
      var p=state.pieces.find(function(p){return same(p.at,at);});
      var sq=document.createElement('button');sq.type='button';sq.className='square';sq.dataset.r=r;sq.dataset.c=c;
      sq.setAttribute('aria-label',label(at)+(p?' '+names[p.piece]+sideName(p.side):' ว่าง'));
      sq.classList.toggle('selected',!!same(at,selected));sq.setAttribute('aria-pressed',String(!!same(at,selected)));
      sq.classList.toggle('target',destinations.some(function(d){return same(d,at);}));
      sq.classList.toggle('last',!!last&&(same(at,last.from)||same(at,last.to)));
      sq.classList.toggle('hintFrom',mode==='play'&&hintNow()&&same(at,hint.move.from));
      if(p){var img=document.createElement('img');img.className='piece';img.src=asset(p);img.alt='';img.draggable=false;sq.appendChild(img);
        if(mode==='play'&&p.piece==='king'&&R.inCheck(state.pieces,p.side))sq.classList.add('check');}
      if(cc===0){var rank=document.createElement('span');rank.className='coord rank';rank.textContent=8-r;sq.appendChild(rank);}
      if(rr===7){var file=document.createElement('span');file.className='coord file';file.textContent=files[c];sq.appendChild(file);}
      $('board').appendChild(sq);
    }
    ['redPalette','whitePalette','editTools'].forEach(function(id){$(id).hidden=mode!=='edit';});
    $('playTools').hidden=mode!=='play';$('load').disabled=mode!=='edit';$('undo').disabled=!history.length&&!(game&&game.resigned);$('redo').disabled=!future.length;
    var aiGame=!!game&&!!game.ai&&mode==='play';$('hint').hidden=$('resign').hidden=!aiGame;if(game&&game.standalone){$('hint').hidden=true;$('newGameBtn').hidden=!aiGame;}
    $('hint').disabled=!canHint();$('resign').disabled=!aiGame;var over=aiGame&&status.state!=='playing';$('resign').classList.toggle('newGame',over);$('resignLabel').textContent=over?'เริ่มใหม่':'ยอมแพ้';$('resign').title=over?'เริ่มเกมใหม่ เลือกสีหมาก':'ยอมแพ้เกมนี้';
    $('emptyMoves').hidden=moves.length>0;
    $('panelTitle').textContent=mode==='edit'?'จัดตำแหน่งหมาก':'ทดลองเดิน';
    $('topSide').textContent=flipped?'ฝ่ายขาว':'ฝ่ายแดง';$('bottomSide').textContent=flipped?'ฝ่ายแดง':'ฝ่ายขาว';
    $('topDot').classList.toggle('white',flipped);$('bottomDot').classList.toggle('white',!flipped);
    $('modeLabel').textContent=mode==='edit'?'1 · ตั้งตำแหน่ง':analysis?'AI ระดับยาก'+(E&&E.tier()?' ('+(E.tier()==='lite'?'Lite':'Full')+')':''):game?(game.ai?'คุณเป็นฝ่าย'+sideName(game.human)+' · AI ระดับ'+(!engineAi()?'ง่าย'+(game.level==='easy'?'':' (สำรอง)'):({easy:'ง่าย',medium:'กลาง',hard:'ยาก'}[game.level])+' (คิดลึก '+(game.level==='hard'&&E&&E.lastDepth()||AI_LIMITS[game.level].depth)+' ชั้น)'):'เครื่องเดียวกัน'):'2 · ทดลองเดิน';document.querySelector('.brand h1').textContent=analysis?'ถอดหมาก':game?(game.ai?'เล่นกับ AI':'เล่น 2 คน'):'ตั้งหมาก';
    if(game&&game.standalone){document.querySelector('.brand h1').textContent='เล่นกับ AI ระดับยาก';$('modeLabel').hidden=true;drawThink();}$('turn').value=state.turn;
    document.querySelectorAll('[data-tool]').forEach(function(b){b.setAttribute('aria-pressed',String(tool===b.dataset.tool));});
    $('fen').value=M.fen(state);
    $('saveNote').textContent=storageOK?'เก็บตำแหน่งที่ตั้งไว้ให้อัตโนมัติในเครื่องนี้ (ไม่ทับด้วยตาที่ทดลองเดิน)':'เครื่องนี้เก็บอัตโนมัติไม่ได้ กรุณาคัดลอกรหัสไว้';
    $('boardCaption').textContent=mode==='edit'?'เลือก → แตะช่องเพื่อวาง':'จุดสีเขียว = ช่องที่เดินได้';
    if(mode==='edit'){
      var parts=tool.split(':');
      $('instruction').textContent=tool==='erase'?'แตะหมากบนกระดานเพื่อลบ':tool!=='move'?'แตะช่องเพื่อวาง'+names[parts[1]]+sideName(parts[0])+' · แตะซ้ำเพื่อเอาออก':selected?'แตะช่องใหม่เพื่อย้าย'+names[pieceAt(selected).piece]:'เลือกหมากด้านล่าง แล้วแตะช่องบนกระดาน';
      message('');
    }else{
      // Play mode shows no help text under the board: the turn line beside the move record says whose move it is.
      $('turnHeading').textContent=status.state==='checkmate'?'รุกจน · '+sideName(status.winner)+'ชนะ':status.state==='playing'?(aiTurn()?(future.length?'ย้อนดูตาเดิน · ตาของ AI ('+sideName(state.turn)+')':engineAi()&&engine.state==='loading'?'กำลังโหลด AI'+(engine.progress?' '+engine.progress+'%':'…'):'AI ('+sideName(state.turn)+') กำลังคิด'):sideName(state.turn)+'เดิน')+(status.check?' · รุก!':''):status.state==='stalemate'?'อับ · เสมอ':status.state==='countdraw'?'นับครบ · เสมอ':status.state==='repetition'?'เดินซ้ำ 3 ครั้ง · เสมอ':status.state==='resign'?'ยอมแพ้ · '+sideName(status.winner)+'ชนะ':'เสมอ';
      $('countLine').textContent=P.countText(count,sideName)+(count&&count.extra&&!count.draw&&status.state==='playing'&&state.turn!==count.counter?' · ฝ่าย'+sideName(opponent(count.counter))+'เหลือตาสุดท้าย':'');$('countLine').hidden=!count;$('countLine').classList.toggle('alert',!!count&&(count.extra||count.value>=count.ceiling-3));
      // Board count: only the weaker side (or an even side) may ask for it, on its own turn. The special count
      // (ข้อ ข 4.2, pawns still on the board) may be asked for by either side ("ฝ่ายที่ต้องการนับ").
      var special=canAskSpecial(),mayAsk=status.state==='playing'&&!aiTurn()&&(special||P.canRequestBoardCount(state.pieces,count)&&P.material(state.pieces,state.turn)<=P.material(state.pieces,opponent(state.turn)));
      $('requestCount').hidden=!mayAsk;$('requestCount').textContent=special?'นับเพื่อเสมอ กรณีพิเศษ':'ฝ่าย'+sideName(state.turn)+'ขอนับศักดิ์กระดาน';
      $('requestCount').title=special?'ยังมีเบี้ยคว่ำแต่รูปหมากไม่เปลี่ยน: นับ 1 ถึง 64 ถ้ายังไม่มีผลแพ้ชนะ เสมอ':'';
      $('turnHeading').classList.toggle('alert',status.state!=='playing'||!!status.check);
      $('instruction').textContent=status.state==='playing'?(status.check?'รุก! ต้องเดินให้ขุนพ้นจากการรุก':'ตาฝ่าย'+sideName(state.turn)+' ลากหรือแตะหมากไปช่องที่มีจุด'):'จบตำแหน่งนี้แล้ว ย้อนกลับเพื่อทดลองทางอื่นได้';
      message((hint&&!hint.move&&hint.fen===M.fen(state)&&status.state==='playing'?'กำลังหาคำใบ้…':status.state==='resign'?'คุณยอมแพ้ — ฝ่าย'+sideName(status.winner)+'ชนะ · กดย้อนกลับเพื่อเล่นต่อ':status.state==='checkmate'?'รุกจน — ฝ่าย'+sideName(status.winner)+'ชนะ':status.state==='stalemate'?'เสมอเพราะอับ — ไม่มีตาเดินและขุนไม่ถูกรุก':status.state==='draw'?'เสมอ — เหลือขุนทั้งสองฝ่าย':status.state==='countdraw'?'เสมอ — นับครบตามกติกาแล้วยังไม่รุกจน':status.state==='repetition'?'เสมอ — ตำแหน่งเดิมเกิดขึ้นครบ 3 ครั้ง':status.check?'ขุน'+sideName(state.turn)+'กำลังถูกรุก':engine.reason?'AI ระดับยากใช้ไม่ได้: '+engine.reason:'')+(game&&game.lesson&&status.state!=='playing'?' · กด “← บทเรียน” เพื่อกลับไปผ่านบท':''),!!engine.reason&&!status.check);
    }
    $('openReview').hidden=!aiGame||reviewing||status.state==='playing'||!review;
    renderMoves();if(reviewing)drawGameReview();scheduleFit();
  }
  // /ai during the game: the record in the same sliding row as in วิเคราะห์การเดิน (‹ › one move back or on).
  function drawPlayStrip(){if(game&&game.standalone&&!reviewing&&trial)drawMoveStrip(fullLine(),moves.length,null,['psMoves','psPrev','psNext']);}
  function renderMoves(){drawPlayStrip();
    var body=$('moveList');body.replaceChildren();
    var rows=[],line=fullLine(),current=moves.length-1;
    line.forEach(function(move,index){
      if(move.side==='white'||!rows.length||rows[rows.length-1].black)rows.push({});
      rows[rows.length-1][move.side]={record:move,index:index};
    });
    rows.forEach(function(row,index){
      var tr=document.createElement('tr'),number=document.createElement('th');
      number.scope='row';number.className='moveNumber';number.textContent=index+1;tr.appendChild(number);
      ['white','black'].forEach(function(side){
        var td=document.createElement('td'),entry=row[side];
        if(entry){
          var move=entry.record,wrap=document.createElement('div'),text=document.createElement('span');
          wrap.className='moveEntry';text.className='moveNotation';
          text.textContent=move.abbreviation+'.'+move.from+(move.capture?'×':'-')+move.to+move.suffix;
          var img=document.createElement('img');img.src=asset(move);img.alt='';img.className='moveIcon';
          wrap.appendChild(img);wrap.appendChild(text);td.appendChild(wrap);
          td.title=sideName(side)+' '+names[move.piece]+' '+move.text+(move.promotion?' · '+move.promotionNote:'');
          if(move.promotion){var note=document.createElement('small');note.className='promotionNote';note.textContent='หงายเบี้ย';td.appendChild(note);}
          var rated=reviewing&&ratingOf(entry.index);
          if(rated){var badge=document.createElement('span');badge.className='rateBadge '+rated.kind;badge.textContent=rated.kind==='best'?'★':rated.kind==='good'?'👍':'?';badge.title=KIND_TEXT[rated.kind];wrap.insertBefore(badge,wrap.firstChild);}
          td.dataset.ply=entry.index+1;td.tabIndex=0;td.classList.add('movePick');
          if(entry.index===current){td.classList.add('latestMove');td.setAttribute('aria-current','true');}
          else if(entry.index>current)td.classList.add('laterMove');
        }else{td.textContent='—';td.className='noMove';td.setAttribute('aria-label','ยังไม่มีการเดินของฝ่าย'+sideName(side));}
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    var scroll=$('moveTableScroll');scroll.hidden=false;
    var key=moves.length+':'+line.length+':'+(moves.length?moves[moves.length-1].text:'');
    if(scroll.dataset.lastMove!==key){
      scroll.dataset.lastMove=key;
      var mark=body.querySelector('.latestMove');
      if(!mark||current===line.length-1)scroll.scrollTop=current<0?0:scroll.scrollHeight;
      else{var top=mark.offsetTop-scroll.clientHeight/2+mark.offsetHeight/2;scroll.scrollTop=Math.max(0,top);}
    }
  }
  function animateMove(from,to){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var img=$('board').querySelector('[data-r="'+to.r+'"][data-c="'+to.c+'"] img');
    if(!img||!img.animate)return;
    var size=$('board').clientWidth/8,sign=flipped?-1:1;
    var cell=img.parentElement;cell.style.zIndex='3';
    var animation=img.animate([{transform:'translate('+(from.c-to.c)*size*sign+'px,'+(from.r-to.r)*size*sign+'px)'},{transform:'translate(0,0)'}],{duration:210,easing:'ease-out'});
    animation.onfinish=animation.oncancel=function(){cell.style.zIndex='';};
  }
  function editMove(from,to){
    if(same(from,to)){selected=null;render();return;}
    remember();var moving=pieceAt(from);state.pieces=state.pieces.filter(function(p){return !same(p.at,to);});moving.at=to;changed();
  }
  function editPlace(spec,at){
    var parts=spec.split(':');remember();state.pieces=state.pieces.filter(function(p){return !same(p.at,at);});
    state.pieces.push({piece:parts[1],side:parts[0],at:at});changed();
  }
  function editRemove(at){if(!pieceAt(at))return;remember();state.pieces=state.pieces.filter(function(p){return !same(p.at,at);});changed();}
  function playMove(from,at,dragged){
    if(!R.legalDestinations(state.pieces,from).some(function(to){return same(to,at);})){message('เดินช่องนี้ไม่ได้ ลองเลือกช่องที่มีจุดสีเขียว',true);sound.playResult('failure');return;}
    remember();var record=N.formatMove(state.pieces,from,at);
    var mover=state.turn;if(think&&!think.done&&game&&game.ai&&mover===aiSide())think.done=Date.now();state.pieces=R.applyMove(state.pieces,from,at);state.turn=opponent(state.turn);count=P.nextCount(count,state.pieces,mover);last={from:from,to:at};selected=null;
    record.fen=M.fen(state);record.uci=moveKey({from:from,to:at});
    var result=playStatus();
    moves.push(record);
    render();sound.queueMove({from:from,to:at,check:result.check,skipAnimation:true});sound.flush();if(!dragged)animateMove(from,at);
    if(result.state!=='playing')sound.playResult(result.state==='checkmate'?'complete':'draw');
    if(result.state!=='playing'){recordGame(result);showResult();}
    scheduleAi();
  }
  $('board').addEventListener('click',function(e){
    if(suppressClick)return;
    var sq=e.target.closest('.square');if(!sq)return;
    var at={r:Number(sq.dataset.r),c:Number(sq.dataset.c)},p=pieceAt(at);
    if(mode==='edit'){
      if(tool==='erase'){editRemove(at);return;}
      if(tool!=='move'){var spec=tool.split(':');if(p&&p.side===spec[0]&&p.piece===spec[1])editRemove(at);else editPlace(tool,at);return;}
      if(!selected){if(p){selected=at;render();}return;}
      editMove(selected,at);return;
    }
    if(reviewing)return;
    if(playStatus().state!=='playing'){message('ตำแหน่งนี้จบแล้ว กดย้อนกลับ หรือกลับไปตั้งหมาก');return;}
    if(aiTurn()){message(future.length?'ตอนนี้ย้อนดูตาเดินอยู่ กดเดินหน้า หรือแตะตาเดินในบันทึกเพื่อไปต่อ':'รอ AI เดินก่อนนะ');return;}
    if(p&&p.side===state.turn){selected=same(selected,at)?null:at;render();return;}
    if(!selected){message('เลือกหมากฝ่าย'+sideName(state.turn)+'ก่อน แล้วเลือกช่องปลายทาง');return;}
    playMove(selected,at);
  });

  // Drag and drop: from the tray to place, on the board to move, off the board to remove.
  function squareEl(at){return $('board').querySelector('[data-r="'+at.r+'"][data-c="'+at.c+'"]');}
  function squareAt(x,y){var el=document.elementFromPoint(x,y),sq=el&&el.closest&&el.closest('#board .square');return sq?{r:Number(sq.dataset.r),c:Number(sq.dataset.c)}:null;}
  function beginDrag(e,source){if(drag||e.button>0||!e.isPrimary)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,source:source,ghost:null,started:false};}
  $('board').addEventListener('pointerdown',function(e){
    var sq=e.target.closest('.square');if(!sq)return;
    var at={r:Number(sq.dataset.r),c:Number(sq.dataset.c)},p=pieceAt(at);if(!p)return;
    if(mode==='play'&&(reviewing||aiTurn()||p.side!==state.turn||playStatus().state!=='playing'))return;
    beginDrag(e,{from:at,piece:p});
  });
  function startDrag(){
    drag.started=true;
    if(mode==='play')selected=drag.source.from;else if(drag.source.from)selected=null;
    render();
    var size=$('board').clientWidth/8,ghost=document.createElement('img');
    ghost.className='dragGhost';ghost.src=asset(drag.source.piece);ghost.alt='';ghost.draggable=false;
    ghost.style.width=ghost.style.height=Math.round(size*1.15)+'px';document.body.appendChild(ghost);drag.ghost=ghost;
    if(drag.source.from)squareEl(drag.source.from).classList.add('dragSource');
    if(mode==='edit'){message('');$('instruction').textContent=drag.source.from?'ลากไปช่องใหม่ หรือลากออกนอกกระดานเพื่อลบ':'ปล่อยบนช่องที่ต้องการวาง';}
  }
  function trackDrag(x,y){
    drag.ghost.style.left=x+'px';drag.ghost.style.top=y+'px';
    var at=squareAt(x,y),old=$('board').querySelector('.dropTarget');
    if(old)old.classList.remove('dropTarget');
    if(at)squareEl(at).classList.add('dropTarget');
    drag.ghost.classList.toggle('removing',mode==='edit'&&!!drag.source.from&&!at);
  }
  function endDrag(){var d=drag;drag=null;if(d.ghost)d.ghost.remove();if(d.started){suppressClick=true;setTimeout(function(){suppressClick=false;},0);}return d;}
  window.addEventListener('pointermove',function(e){
    if(!drag||e.pointerId!==drag.id)return;
    if(!drag.started){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<8)return;startDrag();}
    e.preventDefault();trackDrag(e.clientX,e.clientY);
  },{passive:false});
  window.addEventListener('pointerup',function(e){
    if(!drag||e.pointerId!==drag.id)return;
    var d=endDrag();if(!d.started)return;
    var at=squareAt(e.clientX,e.clientY);
    if(mode==='edit'){
      if(d.source.from){if(at)editMove(d.source.from,at);else editRemove(d.source.from);}
      else if(at)editPlace(d.source.spec,at);else render();
    }else{render();if(at&&!same(at,d.source.from))playMove(d.source.from,at,true);}
  });
  window.addEventListener('pointercancel',function(e){if(drag&&e.pointerId===drag.id&&endDrag().started)render();});
  $('initial').onclick=function(){remember();state=M.initial();changed();message('ตั้งหมากตำแหน่งเริ่มเกมแล้ว · กด ย้อนกลับ เพื่อเรียกคืน');};
  $('clear').onclick=function(){if(!state.pieces.length)return;remember();state={pieces:[],turn:state.turn};changed();message('ล้างกระดานแล้ว · กด ย้อนกลับ เพื่อเรียกคืน');};
  $('turn').onchange=function(){remember();state.turn=$('turn').value;changed();};
  $('flip').onclick=function(){flipped=!flipped;render();};
  var exportURL=null,notationURL=null;
  var shareTabs=[['tabNotation','shareNotationPanel'],['tabImage','shareImagePanel'],['tabEmbed','shareEmbedPanel']];
  // Games against the AI share the record and a picture only: no ฝังบนเว็บ (embed) tab.
  if(game&&game.ai){$('tabEmbed').hidden=true;$('shareEmbedPanel').hidden=true;shareTabs.pop();}
  function selectShareTab(id){shareTabs.forEach(function(pair){var active=pair[0]===id;$(pair[0]).setAttribute('aria-selected',String(active));$(pair[0]).tabIndex=active?0:-1;$(pair[1]).hidden=!active;});}
  shareTabs.forEach(function(pair,index){$(pair[0]).onclick=function(){selectShareTab(pair[0]);};$(pair[0]).onkeydown=function(e){var n=shareTabs.length,next=e.key==='ArrowRight'?(index+1)%n:e.key==='ArrowLeft'?(index+n-1)%n:e.key==='Home'?0:e.key==='End'?n-1:null;if(next!==null){e.preventDefault();selectShareTab(shareTabs[next][0]);$(shareTabs[next][0]).focus();}};});
  document.querySelectorAll('[data-copy-share]').forEach(function(button){button.onclick=async function(){var field=$(button.dataset.copyShare);try{await navigator.clipboard.writeText(field.value);$('shareNotice').textContent='คัดลอกแล้ว';}catch(e){field.focus();field.select();$('shareNotice').textContent='เลือกข้อความแล้ว กรุณากดคัดลอกบนเครื่อง';}};});
  function prepareShare(){
    var url=new URL(location.href);url.search='';url.hash=new URLSearchParams({fen:M.fen(state),flip:flipped?'1':'0'}).toString();
    $('shareLink').value=url.href;$('shareFen').value=M.fen(state);
    var rows=[];moves.forEach(function(m){if(m.side==='white'||!rows.length||rows[rows.length-1].black)rows.push({});rows[rows.length-1][m.side]=m.text+(m.promotion?' (หงายเบี้ย)':'');});
    var record=['บันทึกหมากรุกไทย','ตำแหน่งเริ่มต้น: '+M.fen(trial?trial.state:state),'ฝ่ายเดินก่อน: '+sideName(trial?trial.state.turn:state.turn),'','ตา\tขาว\tแดง'].concat(rows.map(function(row,i){return (i+1)+'\t'+(row.white||'—')+'\t'+(row.black||'—');}));
    if(!moves.length)record.push('ยังไม่มีรายการเดิน');record.push('','ตำแหน่งปัจจุบัน: '+M.fen(state));
    $('shareMoves').value=record.join('\n');
    if(notationURL)URL.revokeObjectURL(notationURL);notationURL=URL.createObjectURL(new Blob(['\ufeff'+record.join('\n')],{type:'text/plain;charset=utf-8'}));$('downloadNotation').href=notationURL;
    $('shareEmbed').value='<iframe src="'+url.href.replace(/&/g,'&amp;')+'" title="กระดานหมากรุกไทย" width="100%" height="900" loading="lazy" style="border:0;border-radius:12px"></iframe>';
    $('shareNotice').textContent='';$('imageLoading').textContent='กำลังสร้างรูปกระดาน…';$('imageLoading').hidden=false;$('exportPreview').hidden=true;$('downloadBoard').hidden=true;selectShareTab('tabImage');$('exportDialog').showModal();
  }
  $('closeExport').onclick=function(){$('exportDialog').close();};
  $('exportDialog').addEventListener('close',function(){if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null;}if(notationURL){URL.revokeObjectURL(notationURL);notationURL=null;}$('exportPreview').removeAttribute('src');$('options').focus();});
  $('exportBoard').onclick=async function(){
    var button=$('exportBoard'),position=R.clonePieces(state.pieces),orientation=flipped;
    $('optionsDialog').close();button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='กำลังสร้าง…';
    try{prepareShare();
      // Snapshot the position before any asynchronous image loading.
      var sources=Array.from(new Set(position.map(asset))),images={};
      await Promise.all(sources.map(function(src){return new Promise(function(resolve,reject){
        var img=new Image(),timer=setTimeout(function(){img.onload=img.onerror=null;reject(Error('โหลดภาพหมากนานเกินไป'));},15000);
        img.onload=function(){clearTimeout(timer);images[src]=img;resolve();};
        img.onerror=function(){clearTimeout(timer);reject(Error('โหลดภาพหมากไม่สำเร็จ'));};img.src=src;
      });}));
      var canvas=document.createElement('canvas');canvas.width=canvas.height=1600;
      var ctx=canvas.getContext('2d');if(!ctx)throw Error('เบราว์เซอร์นี้สร้างรูปไม่ได้');
      var cell=200;ctx.fillStyle='#efd783';ctx.fillRect(0,0,1600,1600);
      ctx.strokeStyle='#756332';ctx.lineWidth=2;
      for(var i=0;i<=8;i++){var edge=Math.max(1,Math.min(1599,i*cell));ctx.beginPath();ctx.moveTo(edge,0);ctx.lineTo(edge,1600);ctx.stroke();ctx.beginPath();ctx.moveTo(0,edge);ctx.lineTo(1600,edge);ctx.stroke();}
      position.forEach(function(p){var x=(orientation?7-p.at.c:p.at.c)*cell,y=(orientation?7-p.at.r:p.at.r)*cell;
        ctx.save();ctx.shadowColor='#0005';ctx.shadowBlur=4;ctx.shadowOffsetY=3;
        ctx.drawImage(images[asset(p)],x+cell*.065,y+cell*.065,cell*.87,cell*.87);ctx.restore();
      });
      ctx.fillStyle='#574819';ctx.font='bold 30px Tahoma, sans-serif';
      for(var n=0;n<8;n++){
        ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(String(orientation?n+1:8-n),10,n*cell+9);
        ctx.textAlign='right';ctx.textBaseline='bottom';ctx.fillText(files[orientation?7-n:n],(n+1)*cell-10,1590);
      }
      var blob=await new Promise(function(resolve,reject){canvas.toBlob(function(blob){if(blob)resolve(blob);else reject(Error('สร้างไฟล์ PNG ไม่สำเร็จ'));},'image/png');});
      if(!$('exportDialog').open)return;if(exportURL)URL.revokeObjectURL(exportURL);exportURL=URL.createObjectURL(blob);
      $('exportPreview').src=exportURL;$('downloadBoard').href=exportURL;
      $('downloadBoard').download='makruk-board-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
      $('imageLoading').hidden=true;$('exportPreview').hidden=false;$('downloadBoard').hidden=false;
    }catch(e){$('imageLoading').textContent='สร้างรูปไม่ได้: '+e.message+' กรุณาปิดแล้วเปิดแชร์อีกครั้ง';}
    finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent='↗ แชร์ตำแหน่ง';}
  };
  // ย้อนกลับ / เดินหน้า step one move (ply) at a time, white then red; jumpTo(n) shows the position after n moves of
  // the game (tapping a move in the record). Going back past the AI's move leaves it to move: it waits until the
  // game is at its last position again.
  function undo(){
    if(reviewing){reviewStep(-1);return;}
    cancelAi();if($('resultDialog').open)$('resultDialog').close();
    if(game&&game.resigned){game.resigned=false;render();scheduleAi();return;}
    var prev=history.pop();if(!prev)return;future.push(snapshot());restore(prev);scheduleAi();
  }
  function redo(){if(reviewing){reviewStep(1);return;}cancelAi();var next=future.pop();if(!next)return;history.push(snapshot());restore(next);scheduleAi();}
  function jumpTo(n){
    cancelAi();
    while(moves.length>n&&history.length){future.push(snapshot());restore(history.pop());}
    while(moves.length<n&&future.length){history.push(snapshot());restore(future.pop());}
    scheduleAi();
  }
  // The whole game line: with moves to go forward to, the furthest position kept is the end of the line.
  function fullLine(){return future.length?future[0].moves:moves;}
  // ย้อนกลับ and เดินหน้า act at once on every tap, and keep going while held: after 0.35 s, ten steps a second, then
  // faster, so a game of 100 moves rewinds in a few seconds. A click from the keyboard still steps once.
  function repeatButton(button,step){
    var timer=0;
    var stop=function(){clearTimeout(timer);timer=0;};
    var go=function(delay){timer=setTimeout(function(){if(button.disabled){stop();return;}step();go(Math.max(30,delay*0.85));},delay);};
    button.addEventListener('pointerdown',function(e){if(e.button>0)return;step();stop();timer=setTimeout(function(){go(100);},350);});
    ['pointerup','pointerleave','pointercancel'].forEach(function(type){button.addEventListener(type,stop);});
    // A tap or mouse click already stepped on pointerdown (its click has detail > 0); the keyboard's click has none.
    button.addEventListener('click',function(e){if(!e.detail)step();});
    button.addEventListener('contextmenu',function(e){e.preventDefault();});
  }
  repeatButton($('undo'),undo);repeatButton($('redo'),redo);
  var pickMove=function(e){var td=e.target.closest('td.movePick');if(!td||mode!=='play')return;if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();jumpTo(Number(td.dataset.ply));};
  $('moveList').addEventListener('click',pickMove);$('moveList').addEventListener('keydown',pickMove);
  $('start').onclick=function(){var error=M.validate(state);if(error){message(error,true);sound.playResult('failure');return;}save();trial={state:clone(state),history:history.slice(),future:future.slice()};mode='play';history=[];future=[];moves=[];selected=null;last=null;startCount();render();};
  $('restart').onclick=function(){cancelAi();stopReview();hint=null;pickShape();if(game){game.bookDone=false;game.recorded=false;game.resigned=false;}remember();state=clone(trial.state);moves=[];selected=null;last=null;startCount();render();$('optionsDialog').close();scheduleAi();};
  $('edit').onclick=function(){cancelAi();game=null;count=null;mode='edit';state=clone(trial.state);history=trial.history;future=trial.future;trial=null;moves=[];selected=null;last=null;render();};
  $('load').onclick=function(){if(mode!=='edit')return;try{var next=M.parse($('fen').value);remember();state=next;changed();$('optionsDialog').close();message('เปิดตำแหน่งแล้ว'+(M.validate(state)?' — '+M.validate(state):''));}catch(e){$('saveNote').textContent=e.message;}};
  $('copy').onclick=async function(){try{await navigator.clipboard.writeText($('fen').value);$('saveNote').textContent='คัดลอกรหัสแล้ว';}catch(e){$('fen').focus();$('fen').select();$('saveNote').textContent='เลือกข้อความแล้ว กรุณาคัดลอกด้วยเมนูของเครื่อง';}};
  document.addEventListener('keydown',function(e){if(reviewing&&(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();reviewStep(e.key==='ArrowLeft'?-1:1);return;}if(reviewing&&e.key==='Escape'&&!document.querySelector('dialog[open]')){closeReview();return;}if(e.key==='Escape'&&!$('exportDialog').open&&!$('optionsDialog').open){if(drag)return;selected=null;tool='move';render();}});
  $('options').onclick=function(){$('optionsDialog').showModal();};
  $('closeOptions').onclick=function(){$('optionsDialog').close();};
  $('optionsDialog').addEventListener('close',function(){$('options').focus();});

  var fitFrame=0;
  function scheduleFit(){if(fitFrame)return;fitFrame=requestAnimationFrame(function(){fitFrame=0;fitWorkspace();});}
  var STANDALONE_RESERVE=230;
  function fitWorkspace(){
    var main=document.querySelector('main'),panel=document.querySelector('.controlPanel'),dock=document.querySelector('.actionDock');
    var style=getComputedStyle(main),gap=parseFloat(style.rowGap)||0;
    var available=main.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-dock.offsetHeight-gap;
    var stacked=getComputedStyle(document.body).getPropertyValue('--stacked').trim()==='1';
    var boardArea=document.querySelector('.boardArea'),size;
    // /ai: one board size for the whole page (the game, its end and the review), from the window alone, with a gutter
    // on the left for the review's evaluation bar, so the board never resizes or jumps.
    if(stacked&&game&&game.standalone){
      var head=document.querySelector('.pageHeader').offsetHeight;
      size=Math.min(main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-26,window.innerHeight-head-STANDALONE_RESERVE);
    }else if(stacked){
      var feedback=document.querySelector('.positionFeedback').offsetHeight;
      var tools=parseFloat(getComputedStyle(main).getPropertyValue('--tools-reserve'))||112;
      var panelHeight=($('analysisPanel').hidden||reviewing?0:$('analysisPanel').offsetHeight+6)+(reviewing?document.querySelector('.grCoach').offsetHeight+6:0)+(document.body.classList.contains('aiGame')?document.querySelector('.topBar').offsetHeight:0);
      // ถอดหมาก uses the lesson page's board size (16 px from each side) and leaves the move record what is left.
      if(analysis&&mode==='play')size=Math.min(window.innerWidth-32,available-panelHeight-feedback-gap-72);
      // Game Review: below the board only the review panel and a few lines of the record, so the board takes the rest.
      else if(reviewing)size=Math.min(main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-26,available-feedback-gap-panelHeight-$('gameReview').offsetHeight-document.querySelector('.topBar').offsetHeight-90);
      else size=Math.min(main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),available-tools-feedback-gap-8-panelHeight);
    }else{size=Math.min(boardArea.clientWidth,available-44-($('analysisPanel').hidden?0:$('analysisPanel').offsetHeight+6));}
    main.style.setProperty('--board-size',Math.max(80,Math.floor(size))+'px');
  }
  // Fixed scale on phones: block pinch and gesture zoom (iOS ignores user-scalable).
  ['gesturestart','gesturechange'].forEach(function(type){document.addEventListener(type,function(e){e.preventDefault();});});
  document.addEventListener('touchmove',function(e){if(e.touches.length>1)e.preventDefault();},{passive:false});
  window.addEventListener('resize',scheduleFit);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',scheduleFit);
  if(window.ResizeObserver){var fitObserver=new ResizeObserver(scheduleFit);['.pageHeader','.actionDock','#editTools','.positionFeedback','#analysisPanel','#gameReview','.grCoach'].forEach(function(selector){fitObserver.observe(document.querySelector(selector));});}

  if(analysis&&!game){
    // ถอดหมาก starts moving at once, from the shared position (#fen=) or the opening position.
    var hasFen=false;try{hasFen=new URLSearchParams(location.hash.slice(1)).has('fen');}catch(e){}
    if(!hasFen)state=M.initial();
    // The same full engine as on a computer, phones included (engine-ai.js preferFull); the network file (48 MB) shows
    // its download in the evaluation bar.
    if(E&&E.preferFull)E.preferFull(function(f){var pct=Math.floor(f*100);if(pct!==engine.progress){engine.progress=pct;if(!view.lines.length)drawAnalysis();}});
    notice='';trial={state:clone(state),history:[],future:[]};mode='play';history=[];future=[];moves=[];selected=null;last=null;startCount();
  }
  if(game){
    // Start straight from the opening position; the teacher's saved setup is left untouched.
    state=M.initial();flipped=!!game.ai&&game.human==='black';notice='';
    // In a game the options start with "เริ่มเกมใหม่"; the board cannot be edited (no แก้ตำแหน่ง button).
    var body=$('restart').parentNode;body.insertBefore($('restart'),body.firstChild);
    trial={state:clone(state),history:[],future:[]};mode='play';history=[];future=[];moves=[];selected=null;last=null;startCount();
  }
  if(standalone){document.body.classList.add('standalonePage');$('thinkBar').hidden=false;setInterval(drawThink,100);}
  if(game&&game.ai){
    // ตัวเลือก and พลิก become small icons at the top right above the board; the dock keeps ย้อนกลับ, เดินหน้า, คำใบ้, ยอมแพ้.
    document.body.classList.add('aiGame');$('boardTools').hidden=false;$('boardTools').append($('options'),$('flip'));
    loadEngine();if(window.MakrukTablebase)MakrukTablebase.load();
  }
  // ถอดหมาก: the endgame table answers king + rook against king positions (see tableView).
  if(analysis&&window.MakrukTablebase)MakrukTablebase.load().then(function(ok){if(ok){view.fen=null;render();}});
  render();if(notice)message(notice,notice!=='เปิดตำแหน่งจากลิงก์แชร์แล้ว');
  // The board shows, and the AI starts, once every piece picture is loaded (piece-colors.js), at most 2.5 s.
  document.body.classList.add('piecesLoading');
  Promise.race([window.MakrukPieceColors.ready,new Promise(function(r){setTimeout(r,2500);})]).then(function(){document.body.classList.remove('piecesLoading');scheduleAi();});
})();
