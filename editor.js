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
  try{var playParams=new URLSearchParams(location.search);if(playParams.get('play')==='2')game={ai:false};else if(playParams.get('play')==='ai')game={ai:true,human:playParams.get('side')==='black'?'black':'white',level:['easy','hard'].indexOf(playParams.get('level'))>=0?playParams.get('level'):'medium',lesson:playParams.get('lesson')};}catch(e){}
  function aiSide(){return game&&game.ai?opponent(game.human):null;}
  // Each game the AI opens with one of the shapes in makruk-play.js (OPENINGS), picked at random: centre pawns ง4 จ4,
  // or flank pawns จ4 ฉ4 (ง5 ค5 for red) with the met and a knight behind them.
  function pickShape(){if(game&&game.ai){var shapes=Object.keys(P.OPENINGS);game.shape=shapes[Math.floor(Math.random()*shapes.length)];}}
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
  function engineAi(){return !!game&&!!game.ai&&engine.state!=='failed';}
  function cancelAi(){clearTimeout(aiTimer);aiTimer=0;aiSearch++;}
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
    // While an earlier position of the game is on the board (moves to go forward to), the AI waits.
    if(!aiTurn()||future.length||playStatus().state!=='playing')return;
    var token=aiSearch,hard=engineAi();
    // Engine AI: the opening shape first (ง4 จ4 / ง5 จ5 pawns, then the pieces behind them); once it is done or has
    // to stop, the engine plays the rest of the game. Decided now, so an engine move does not wait the opening delay.
    var book=hard&&!game.bookDone&&P.openingChoice(state.pieces,state.turn,game.shape);
    // The answer to an advanced pawn against the flank shape (makruk-play.js FLANK_ANSWER) is played even after the
    // shape has handed over to the engine.
    if(hard&&game.bookDone&&!book)book=P.flankAnswer(state.pieces,state.turn,game.shape);
    if(hard&&!book)game.bookDone=true;
    aiTimer=setTimeout(function(){
      aiTimer=0;if(token!==aiSearch||!aiTurn())return;
      // The AI asks for the ordinary board count when it is behind; the special count is for the player only.
      if(P.canRequestBoardCount(state.pieces,count)&&P.material(state.pieces,state.turn)<P.material(state.pieces,opponent(state.turn)))count=P.requestBoardCount(state.turn);
      var repeats=function(ps,turn){return repetitions(M.fen({pieces:ps,turn:turn}));};
      var easy=function(){var move=P.chooseMove(state.pieces,state.turn,{count:count,repeats:repeats,shape:game.shape,mistakes:game.level==='easy'?0.35:0});if(move)playMove(move.from,move.to);};
      if(!hard){easy();return;}
      if(book){playMove(book.from,book.to);return;}
      // The engine gets the moves since the last pawn move or capture (no position before it can come back), so it
      // sees the repetitions and never needs a promotion suffix.
      var since=moves.length;while(since>0&&moves[since-1].piece!=='pawn'&&!moves[since-1].capture)since--;
      E.bestMove(since?moves[since-1].fen:M.fen(trial.state),moves.slice(since).map(function(m){return m.uci;}),AI_LIMITS[game.level]).then(function(key){
        if(token!==aiSearch||!aiTurn())return;
        var move=key&&R.legalMoves(state.pieces,state.turn).find(function(m){return moveKey(m)===key;});
        if(move)playMove(move.from,move.to);else easy();
      },function(){if(token===aiSearch&&aiTurn())easy();});
    },hard?(book||game.level!=='hard'?500:100):700);
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
    var on=analysis&&mode==='play',lines=view.lines,top=lines[0];
    $('analysisPanel').hidden=!on;$('bestMove').hidden=!on;$('bestMove').disabled=!top;
    $('arrowLayer').innerHTML='';
    if(!on)return;
    $('evalBar').hidden=!assist.bar;$('engineLines').hidden=!assist.lines;
    $('modeLabel').textContent='AI ระดับยาก'+(E&&E.tier()?' ('+(E.tier()==='lite'?'Lite':'Full')+')':'');
    var v=top?whiteValue(top.score,state.turn):0;
    $('evalFill').style.width=(top?(top.score.mate!==undefined?(v>0?100:0):50+50*Math.tanh(v/4)):50)+'%';
    $('evalText').textContent=top?scoreText(top.score,state.turn)+' · ลึก '+view.depth:(view.error||'AI กำลังคิด…');
    var list=$('engineLines');list.replaceChildren();
    if(view.error){var err=document.createElement('li');err.className='lineError';err.textContent=view.error;list.appendChild(err);}
    // Always two rows (empty while the AI thinks), so the panel keeps its height and the board never jumps.
    if(!view.error)[0,1].forEach(function(i){
      var l=lines[i],li=document.createElement('li'),b=document.createElement('button');b.type='button';b.disabled=!l;
      b.innerHTML='<span class="lineScore"></span><span class="linePv"></span>';
      b.firstChild.textContent=l?scoreText(l.score,state.turn):'…';b.lastChild.textContent=l?pvText(l.pv,8):'';
      if(l)b.addEventListener('click',function(){var m=l.pv[0];if(m)playMove(square(m,0),square(m,2));});
      li.appendChild(b);list.appendChild(li);
    });
    if(top&&assist.arrows&&top.pv[0])$('arrowLayer').innerHTML+=arrow(top.pv[0],'rgba(74,163,223,.88)');
    if(top&&assist.threats&&top.pv[1])$('arrowLayer').innerHTML+=arrow(top.pv[1],'rgba(216,52,44,.8)',true);
    // The last move's rating sits at the right of the evaluation bar (play mode shows no status line).
    var feedback=assist.feedback?moveFeedback():'',rating=$('moveRating');
    rating.hidden=!feedback;rating.textContent=feedback.replace(/ · เสียไป .*/,'');rating.title=feedback;
    rating.className='moveRating'+(/พลาดหนัก|Mistake|พลาด/.test(feedback)?' bad':/ไม่แม่น/.test(feedback)?' warn':' good');
  }
  function updateAnalysis(){
    if(!analysis)return;
    if(mode!=='play'){if(E)E.stopAnalysis();view.fen=null;drawAnalysis();return;}
    var fen=M.fen(state);
    if(fen!==view.fen){
      view.prev=view.fen?{line:view.lines[0],turn:view.turn,moves:view.moves}:null;
      view.fen=fen;view.turn=state.turn;view.moves=moves.length;view.lines=[];view.depth=0;view.done=false;
      if(playStatus().state!=='playing'){if(E)E.stopAnalysis();}
      else if(!E){view.error='เปิด AI ไม่ได้';}
      else E.analyse(fen,function(u){if(view.fen!==fen)return;view.lines=u.lines;view.depth=u.depth;view.done=u.done;drawAnalysis();})
        .catch(function(e){view.error='AI ใช้ไม่ได้: '+((e&&e.reason)||'เบราว์เซอร์นี้ยังไม่รองรับ');drawAnalysis();});
    }
    drawAnalysis();
  }
  // Every render also refreshes the analysis and the options that depend on the mode.
  var baseRender=render;
  render=function(){
    baseRender();
    document.body.classList.toggle('analysisMode',analysis&&mode==='play');$('assistOptions').hidden=!analysis;$('analyse').hidden=analysis||mode!=='play';
    if(analysis)updateAnalysis();
    else $('arrowLayer').innerHTML=hintNow()&&hint.stage>1?arrow(moveKey(hint.move),'rgba(76,160,58,.9)'):'';
  };
  // Hint (games against the AI, on the player's turn): the first tap marks the piece the AI would move, the next tap
  // adds an arrow to its square. The engine searches the player's side up to depth 16 (1.5 s at most); without it the
  // player in makruk-play.js suggests. A move, an undo or a new game clears it.
  var hint=null;
  function hintNow(){return !!hint&&!!hint.move&&hint.fen===M.fen(state);}
  function canHint(){return !!game&&!!game.ai&&mode==='play'&&!aiTurn()&&playStatus().state==='playing';}
  $('hint').addEventListener('click',function(){
    if(!canHint())return;
    var fen=M.fen(state);
    if(hint&&hint.fen===fen){if(hint.move){hint.stage=2;render();}return;}
    hint={fen:fen,stage:1,move:null};message('กำลังหาคำใบ้…');
    var found=function(move){if(!hint||hint.fen!==fen)return;if(!move){hint=null;message('ยังหาคำใบ้ไม่ได้ ลองอีกครั้ง');return;}hint.move=move;message('');render();};
    var simple=function(){found(P.chooseMove(state.pieces,state.turn,{count:count}));};
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
    cancelAi();hint=null;pickShape();game.human=side;game.bookDone=false;game.recorded=false;game.resigned=false;flipped=side==='black';
    try{var url=new URL(location.href);url.searchParams.set('side',side);window.history.replaceState(null,'',url);}catch(e){}
    state=M.initial();trial={state:clone(state),history:[],future:[]};history=[];future=[];moves=[];selected=null;last=null;startCount();render();scheduleAi();
  }
  $('newWhite').onclick=function(){newGame('white');};
  $('newBlack').onclick=function(){newGame('black');};

  // Result of a game against the AI: who won and how, a word from the coach, and a game review. The review searches
  // every position from the player's first move to the end with the engine (20 plies, at most REVIEW_TIME ms each)
  // and rates each of the player's moves by how much it lost against the engine's best move:
  // ดีเยี่ยม = the best move or within 0.3 pawn · ดี = within 1.2 pawns · ผิดพลาด = more.
  var REVIEW_DEPTH=20,REVIEW_TIME=2500,review=null;
  var RESULT_REASON={checkmate:'ด้วยการรุกจน',resign:'คุณยอมแพ้',stalemate:'อับ · ฝ่ายที่ต้องเดินไม่มีตาเดิน',draw:'เหลือขุนเปล่าทั้งสองฝ่าย',countdraw:'นับครบศักดิ์',repetition:'เดินซ้ำตำแหน่งเดิม 3 ครั้ง'};
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
  function stopReview(){if(review)review.stopped=true;review=null;}
  function reviewValue(r){
    if(!r||!r.score)return 0;
    return r.score.mate!==undefined?(r.score.mate>0?10000-r.score.mate:-10000-r.score.mate):r.score.cp;
  }
  function startReview(){
    stopReview();
    var line=fullLine().slice(),job={length:line.length,line:line,fens:[M.fen(trial.state)].concat(line.map(function(m){return m.fen;})),values:[],bests:[],rated:[],done:0,total:0,stopped:false,error:''};
    review=job;
    var mine=line.map(function(m,i){return m.side===game.human?i:-1;}).filter(function(i){return i>=0;});
    var need=[];mine.forEach(function(i){if(need.indexOf(i)<0)need.push(i);if(need.indexOf(i+1)<0)need.push(i+1);});
    job.total=need.length;
    if(!E||E.unsupported()||engine.state==='failed'){job.error='เครื่องนี้ใช้ AI วิเคราะห์เกมไม่ได้';drawReview();return;}
    var rate=function(i){
      var clamp=function(v){return Math.max(-1000,Math.min(1000,v));};
      var loss=Math.max(0,clamp(job.values[i])-clamp(-job.values[i+1]));
      var kind=job.bests[i]===line[i].uci||loss<=30?'best':loss<=120?'good':'mistake';
      var better=null;
      if(kind==='mistake'&&job.bests[i]){try{better=N.formatMove(M.parse(job.fens[i]).pieces,square(job.bests[i],0),square(job.bests[i],2)).text;}catch(e){}}
      job.rated.push({i:i,kind:kind,loss:loss,better:better});
    };
    var step=function(k){
      if(job.stopped)return;
      if(k>=need.length){drawReview();return;}
      var at=need[k],parsed=M.parse(job.fens[at]),st=R.gameStatus(parsed.pieces,parsed.turn);
      var after=function(value,best){
        job.values[at]=value;job.bests[at]=best;job.done=k+1;
        mine.forEach(function(i){if(job.values[i]!==undefined&&job.values[i+1]!==undefined&&!job.rated.some(function(r){return r.i===i;}))rate(i);});
        drawReview();step(k+1);
      };
      if(st.state==='checkmate'){after(-10000,null);return;}
      if(st.state!=='playing'){after(0,null);return;}
      E.evaluate(job.fens[at],{depth:REVIEW_DEPTH,time:REVIEW_TIME}).then(function(r){if(!job.stopped)after(reviewValue(r),r.best);},function(){if(job.stopped)return;job.error='AI วิเคราะห์ไม่สำเร็จ';drawReview();});
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
    $('reviewText').textContent=job.error||(job.total?'AI กำลังวิเคราะห์ตาเดิน '+job.done+'/'+job.total+' ตำแหน่ง (ลึก '+REVIEW_DEPTH+' ชั้น)':'ยังไม่มีตาเดินของคุณให้วิเคราะห์');
    var list=job.rated.filter(function(r){return r.kind==='mistake';}).sort(function(a,b){return a.i-b.i;});
    $('reviewList').innerHTML=list.length?list.map(function(r){
      var m=job.line[r.i],no=Math.floor((r.i+(trial.state.turn==='white'?0:1))/2)+1;
      return '<li><b>ตา '+no+'</b> คุณเดิน '+m.text+(r.better?' · ควรเดิน <strong>'+r.better+'</strong>':'')+' <em>(เสีย '+(r.loss/100).toFixed(1)+' เบี้ย)</em></li>';
    }).join(''):(finished&&job.total?'<li class="none">ไม่มีตาที่ผิดพลาด เก่งมาก!</li>':'');
    $('reviewBtn').disabled=!job.rated.length&&!finished;
  }
  $('reviewBtn').onclick=function(){var open=$('reviewList').hidden;$('reviewList').hidden=!open;$('reviewBtn').textContent=open?'ซ่อนรายละเอียด':'★ Game Review · ดูตาที่พลาด';};
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
    var aiGame=!!game&&!!game.ai&&mode==='play';$('hint').hidden=$('resign').hidden=!aiGame;
    $('hint').disabled=!canHint();$('resign').disabled=!aiGame;var over=aiGame&&status.state!=='playing';$('resign').classList.toggle('newGame',over);$('resignLabel').textContent=over?'เริ่มใหม่':'ยอมแพ้';$('resign').title=over?'เริ่มเกมใหม่ เลือกสีหมาก':'ยอมแพ้เกมนี้';
    $('emptyMoves').hidden=moves.length>0;
    $('panelTitle').textContent=mode==='edit'?'จัดตำแหน่งหมาก':'ทดลองเดิน';
    $('topSide').textContent=flipped?'ฝ่ายขาว':'ฝ่ายแดง';$('bottomSide').textContent=flipped?'ฝ่ายแดง':'ฝ่ายขาว';
    $('topDot').classList.toggle('white',flipped);$('bottomDot').classList.toggle('white',!flipped);
    $('modeLabel').textContent=mode==='edit'?'1 · ตั้งตำแหน่ง':analysis?'AI ระดับยาก'+(E&&E.tier()?' ('+(E.tier()==='lite'?'Lite':'Full')+')':''):game?(game.ai?'คุณเป็นฝ่าย'+sideName(game.human)+' · AI ระดับ'+(!engineAi()?'ง่าย'+(game.level==='easy'?'':' (สำรอง)'):({easy:'ง่าย',medium:'กลาง',hard:'ยาก'}[game.level])+' (คิดลึก '+(game.level==='hard'&&E&&E.lastDepth()||AI_LIMITS[game.level].depth)+' ชั้น)'):'เครื่องเดียวกัน'):'2 · ทดลองเดิน';document.querySelector('.brand h1').textContent=analysis?'ถอดหมาก':game?(game.ai?'เล่นกับ AI':'เล่น 2 คน'):'ตั้งหมาก';$('turn').value=state.turn;
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
    renderMoves();scheduleFit();
  }
  function renderMoves(){
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
    var mover=state.turn;state.pieces=R.applyMove(state.pieces,from,at);state.turn=opponent(state.turn);count=P.nextCount(count,state.pieces,mover);last={from:from,to:at};selected=null;
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
    if(mode==='play'&&(aiTurn()||p.side!==state.turn||playStatus().state!=='playing'))return;
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
  function selectShareTab(id){shareTabs.forEach(function(pair){var active=pair[0]===id;$(pair[0]).setAttribute('aria-selected',String(active));$(pair[0]).tabIndex=active?0:-1;$(pair[1]).hidden=!active;});}
  shareTabs.forEach(function(pair,index){$(pair[0]).onclick=function(){selectShareTab(pair[0]);};$(pair[0]).onkeydown=function(e){var next=e.key==='ArrowRight'?(index+1)%3:e.key==='ArrowLeft'?(index+2)%3:e.key==='Home'?0:e.key==='End'?2:null;if(next!==null){e.preventDefault();selectShareTab(shareTabs[next][0]);$(shareTabs[next][0]).focus();}};});
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
    cancelAi();if($('resultDialog').open)$('resultDialog').close();
    if(game&&game.resigned){game.resigned=false;render();scheduleAi();return;}
    var prev=history.pop();if(!prev)return;future.push(snapshot());restore(prev);scheduleAi();
  }
  function redo(){cancelAi();var next=future.pop();if(!next)return;history.push(snapshot());restore(next);scheduleAi();}
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
  $('restart').onclick=function(){cancelAi();hint=null;pickShape();if(game){game.bookDone=false;game.recorded=false;game.resigned=false;}remember();state=clone(trial.state);moves=[];selected=null;last=null;startCount();render();$('optionsDialog').close();scheduleAi();};
  $('edit').onclick=function(){cancelAi();game=null;count=null;mode='edit';state=clone(trial.state);history=trial.history;future=trial.future;trial=null;moves=[];selected=null;last=null;render();};
  $('load').onclick=function(){if(mode!=='edit')return;try{var next=M.parse($('fen').value);remember();state=next;changed();$('optionsDialog').close();message('เปิดตำแหน่งแล้ว'+(M.validate(state)?' — '+M.validate(state):''));}catch(e){$('saveNote').textContent=e.message;}};
  $('copy').onclick=async function(){try{await navigator.clipboard.writeText($('fen').value);$('saveNote').textContent='คัดลอกรหัสแล้ว';}catch(e){$('fen').focus();$('fen').select();$('saveNote').textContent='เลือกข้อความแล้ว กรุณาคัดลอกด้วยเมนูของเครื่อง';}};
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('exportDialog').open&&!$('optionsDialog').open){if(drag)return;selected=null;tool='move';render();}});
  $('options').onclick=function(){$('optionsDialog').showModal();};
  $('closeOptions').onclick=function(){$('optionsDialog').close();};
  $('optionsDialog').addEventListener('close',function(){$('options').focus();});

  var fitFrame=0;
  function scheduleFit(){if(fitFrame)return;fitFrame=requestAnimationFrame(function(){fitFrame=0;fitWorkspace();});}
  function fitWorkspace(){
    var main=document.querySelector('main'),panel=document.querySelector('.controlPanel'),dock=document.querySelector('.actionDock');
    var style=getComputedStyle(main),gap=parseFloat(style.rowGap)||0;
    var available=main.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-dock.offsetHeight-gap;
    var stacked=getComputedStyle(document.body).getPropertyValue('--stacked').trim()==='1';
    var boardArea=document.querySelector('.boardArea'),size;
    if(stacked){
      var feedback=document.querySelector('.positionFeedback').offsetHeight;
      var tools=parseFloat(getComputedStyle(main).getPropertyValue('--tools-reserve'))||112;
      var panelHeight=($('analysisPanel').hidden?0:$('analysisPanel').offsetHeight+6)+(document.body.classList.contains('aiGame')?document.querySelector('.topBar').offsetHeight:0);
      // ถอดหมาก uses the lesson page's board size (16 px from each side) and leaves the move record what is left.
      if(analysis&&mode==='play')size=Math.min(window.innerWidth-32,available-panelHeight-feedback-gap-72);
      else size=Math.min(main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),available-tools-feedback-gap-8-panelHeight);
    }else{size=Math.min(boardArea.clientWidth,available-44-($('analysisPanel').hidden?0:$('analysisPanel').offsetHeight+6));}
    main.style.setProperty('--board-size',Math.max(80,Math.floor(size))+'px');
  }
  // Fixed scale on phones: block pinch and gesture zoom (iOS ignores user-scalable).
  ['gesturestart','gesturechange'].forEach(function(type){document.addEventListener(type,function(e){e.preventDefault();});});
  document.addEventListener('touchmove',function(e){if(e.touches.length>1)e.preventDefault();},{passive:false});
  window.addEventListener('resize',scheduleFit);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',scheduleFit);
  if(window.ResizeObserver){var fitObserver=new ResizeObserver(scheduleFit);['.pageHeader','.actionDock','#editTools','.positionFeedback','#analysisPanel'].forEach(function(selector){fitObserver.observe(document.querySelector(selector));});}

  if(analysis&&!game){
    // ถอดหมาก starts moving at once, from the shared position (#fen=) or the opening position.
    var hasFen=false;try{hasFen=new URLSearchParams(location.hash.slice(1)).has('fen');}catch(e){}
    if(!hasFen)state=M.initial();
    notice='';trial={state:clone(state),history:[],future:[]};mode='play';history=[];future=[];moves=[];selected=null;last=null;startCount();
  }
  if(game){
    // Start straight from the opening position; the teacher's saved setup is left untouched.
    state=M.initial();flipped=!!game.ai&&game.human==='black';notice='';
    // In a game the options start with "เริ่มเกมใหม่"; the board cannot be edited (no แก้ตำแหน่ง button).
    var body=$('restart').parentNode;body.insertBefore($('restart'),body.firstChild);
    trial={state:clone(state),history:[],future:[]};mode='play';history=[];future=[];moves=[];selected=null;last=null;startCount();
  }
  if(game&&game.ai){
    // ตัวเลือก and พลิก become small icons at the top right above the board; the dock keeps ย้อนกลับ, เดินหน้า, คำใบ้, ยอมแพ้.
    document.body.classList.add('aiGame');$('boardTools').hidden=false;$('boardTools').append($('options'),$('flip'));
    loadEngine();
  }
  render();if(notice)message(notice,notice!=='เปิดตำแหน่งจากลิงก์แชร์แล้ว');
  // The board shows, and the AI starts, once every piece picture is loaded (piece-colors.js), at most 2.5 s.
  document.body.classList.add('piecesLoading');
  Promise.race([window.MakrukPieceColors.ready,new Promise(function(r){setTimeout(r,2500);})]).then(function(){document.body.classList.remove('piecesLoading');scheduleAi();});
})();
