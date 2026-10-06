(function(){
  'use strict';
  var M=window.MakrukEditor,R=window.MakrukRules,N=window.MakrukNotation,$=function(id){return document.getElementById(id);};
  var names={king:'ขุน',khon:'โคน',met:'เม็ด',knight:'ม้า',rook:'เรือ',pawn:'เบี้ย',promoted:'เบี้ยหงาย'};
  var icons={king:'K',khon:'B',met:'Q',knight:'N',rook:'R',pawn:'P',promoted:'F'};
  var files=['ก','ข','ค','ง','จ','ฉ','ช','ญ'];
  var state=M.initial(),mode='edit',tool='move',selected=null,flipped=false,history=[],future=[],trial=null,moves=[],last=null;
  var storageKey='makrukTeachingEditorV1',notice='',storageOK=true;
  try{var saved=localStorage.getItem(storageKey);if(saved)state=M.parse(saved);}catch(e){notice='เปิดตำแหน่งที่เก็บไว้ไม่ได้ จึงแสดงตำแหน่งเริ่มเกม';}
  try{var sharedParams=new URLSearchParams(location.hash.slice(1));if(sharedParams.has('fen')){state=M.parse(sharedParams.get('fen'));flipped=sharedParams.get('flip')==='1';notice='เปิดตำแหน่งจากลิงก์แชร์แล้ว';}}catch(e){notice='ลิงก์ตำแหน่งไม่ถูกต้อง จึงเปิดตำแหน่งที่เก็บไว้แทน';}
  var sound=window.MakrukPresentation.create({board:$('board'),wrap:$('boardWrap')});
  function same(a,b){return a&&b&&a.r===b.r&&a.c===b.c;}
  function opponent(side){return side==='white'?'black':'white';}
  function sideName(side){return side==='white'?'ขาว':'แดง';}
  function label(at){return files[at.c]+(8-at.r);}
  function asset(p){return 'assets/pieces/makruk/ada/'+(p.side==='white'?'w':'r')+icons[p.piece]+'.svg';}
  function clone(s){return {pieces:R.clonePieces(s.pieces),turn:s.turn};}
  function save(){if(mode!=='edit')return;try{localStorage.setItem(storageKey,M.fen(state));storageOK=true;}catch(e){storageOK=false;}}
  function snapshot(){return {state:clone(state),moves:moves.slice(),last:last};}
  function restore(item){state=item.state;moves=item.moves;last=item.last;selected=null;save();render();}
  function remember(){future=[];history.push(snapshot());if(history.length>200)history.shift();}
  function message(text,error){$('status').textContent=text;$('status').classList.toggle('error',!!error);document.querySelector('.positionFeedback').classList.toggle('hasStatus',!!text);scheduleFit();}
  function changed(){selected=null;last=null;save();render();}
  function chooseTool(value){tool=value;selected=null;render();}
  function palette(id,side){
    Object.keys(names).forEach(function(piece){
      var button=document.createElement('button');button.type='button';button.dataset.tool=side+':'+piece;
      button.setAttribute('aria-label',names[piece]+sideName(side));button.setAttribute('aria-pressed','false');
      var img=document.createElement('img');img.src=asset({piece:piece,side:side});img.alt='';img.draggable=false;
      button.appendChild(img);button.appendChild(document.createTextNode(names[piece]));
      button.addEventListener('click',function(){chooseTool(button.dataset.tool);});$(id).appendChild(button);
    });
  }
  palette('redPalette','black');palette('whitePalette','white');
  function render(){
    sound.clearMotion();
    document.body.dataset.mode=mode;$('setupOptions').hidden=mode!=='edit';$('restart').hidden=mode!=='play';$('edit').hidden=mode!=='play';
    $('board').replaceChildren();
    var destinations=mode==='play'&&selected?R.legalDestinations(state.pieces,selected):[];
    var status=mode==='play'?R.gameStatus(state.pieces,state.turn):null;
    for(var rr=0;rr<8;rr++)for(var cc=0;cc<8;cc++){
      var r=flipped?7-rr:rr,c=flipped?7-cc:cc,at={r:r,c:c};
      var p=state.pieces.find(function(p){return same(p.at,at);});
      var sq=document.createElement('button');sq.type='button';sq.className='square';sq.dataset.r=r;sq.dataset.c=c;
      sq.setAttribute('aria-label',label(at)+(p?' '+names[p.piece]+sideName(p.side):' ว่าง'));
      sq.classList.toggle('selected',!!same(at,selected));sq.setAttribute('aria-pressed',String(!!same(at,selected)));
      sq.classList.toggle('target',destinations.some(function(d){return same(d,at);}));
      sq.classList.toggle('last',!!last&&(same(at,last.from)||same(at,last.to)));
      if(p){var img=document.createElement('img');img.className='piece';img.src=asset(p);img.alt='';img.draggable=false;sq.appendChild(img);
        if(mode==='play'&&p.piece==='king'&&R.inCheck(state.pieces,p.side))sq.classList.add('check');}
      if(cc===0){var rank=document.createElement('span');rank.className='coord rank';rank.textContent=8-r;sq.appendChild(rank);}
      if(rr===7){var file=document.createElement('span');file.className='coord file';file.textContent=files[c];sq.appendChild(file);}
      $('board').appendChild(sq);
    }
    ['redPalette','whitePalette','editTools'].forEach(function(id){$(id).hidden=mode!=='edit';});
    $('playTools').hidden=mode!=='play';$('load').disabled=mode!=='edit';$('undo').disabled=!history.length;$('redo').disabled=!future.length;
    $('startArea').hidden=mode!=='edit';$('emptyMoves').hidden=moves.length>0;
    $('panelTitle').textContent=mode==='edit'?'จัดตำแหน่งหมาก':'ทดลองเดิน';
    $('topSide').textContent=flipped?'ฝ่ายขาว':'ฝ่ายแดง';$('bottomSide').textContent=flipped?'ฝ่ายแดง':'ฝ่ายขาว';
    $('topDot').classList.toggle('white',flipped);$('bottomDot').classList.toggle('white',!flipped);
    $('modeLabel').textContent=mode==='edit'?'1 · ตั้งตำแหน่ง':'2 · ทดลองเดิน';$('turn').value=state.turn;
    $('moveTool').setAttribute('aria-pressed',String(tool==='move'));$('eraseTool').setAttribute('aria-pressed',String(tool==='erase'));
    document.querySelectorAll('[data-tool]').forEach(function(b){b.setAttribute('aria-pressed',String(tool===b.dataset.tool));});
    $('fen').value=M.fen(state);
    $('saveNote').textContent=storageOK?'เก็บตำแหน่งที่ตั้งไว้ให้อัตโนมัติในเครื่องนี้ (ไม่ทับด้วยตาที่ทดลองเดิน)':'เครื่องนี้เก็บอัตโนมัติไม่ได้ กรุณาคัดลอกรหัสไว้';
    $('boardCaption').textContent=mode==='edit'?'เลือก → แตะช่องเพื่อวาง':'จุดสีเขียว = ช่องที่เดินได้';
    if(mode==='edit'){
      var parts=tool.split(':');
      $('instruction').textContent=tool==='move'?(selected?'เลือกช่องใหม่ให้'+names[state.pieces.find(function(p){return same(p.at,selected);}).piece]:'แตะหมากบนกระดาน แล้วแตะช่องใหม่เพื่อย้าย'):tool==='erase'?'แตะหมากที่ต้องการลบออกจากกระดาน':'กำลังวาง'+names[parts[1]]+sideName(parts[0])+' แตะช่องเพื่อวางซ้ำได้หลายตัว';
      message(M.validate(state),false);
    }else{
      $('turnHeading').textContent=sideName(state.turn)+'เดิน';
      $('instruction').textContent=status.state==='playing'?(status.check?'รุก! ต้องเดินให้ขุนพ้นจากการรุก':'ตาฝ่าย'+sideName(state.turn)+' เลือกหมากแล้วแตะช่องที่มีจุด'):'จบตำแหน่งนี้แล้ว ย้อนกลับเพื่อทดลองทางอื่นได้';
      message(status.state==='checkmate'?'รุกจน — ฝ่าย'+sideName(status.winner)+'ชนะ':status.state==='stalemate'?'เสมอเพราะอับ — ไม่มีตาเดินและขุนไม่ถูกรุก':status.state==='draw'?'เสมอ — เหลือขุนทั้งสองฝ่าย':status.check?'ขุน'+sideName(state.turn)+'กำลังถูกรุก':'');
    }
    renderMoves();scheduleFit();
  }
  function renderMoves(){
    var body=$('moveList');body.replaceChildren();
    var rows=[];
    moves.forEach(function(move,index){
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
          if(entry.index===moves.length-1){td.className='latestMove';td.setAttribute('aria-current','true');}
        }else{td.textContent='—';td.className='noMove';td.setAttribute('aria-label','ยังไม่มีการเดินของฝ่าย'+sideName(side));}
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    var scroll=$('moveTableScroll');scroll.hidden=false;
    var key=moves.length+':'+(moves.length?moves[moves.length-1].text:'');
    if(scroll.dataset.lastMove!==key){scroll.scrollTop=scroll.scrollHeight;scroll.dataset.lastMove=key;}
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
  $('board').addEventListener('click',function(e){
    var sq=e.target.closest('.square');if(!sq)return;
    var at={r:Number(sq.dataset.r),c:Number(sq.dataset.c)},p=state.pieces.find(function(p){return same(p.at,at);});
    if(mode==='edit'){
      if(tool==='move'){
        if(!selected){if(p){selected=at;render();}return;}
        if(same(selected,at)){selected=null;render();return;}
        remember();var moving=state.pieces.find(function(p){return same(p.at,selected);});
        state.pieces=state.pieces.filter(function(p){return !same(p.at,at);});moving.at=at;changed();return;
      }
      if(tool==='erase'&&!p)return;
      remember();state.pieces=state.pieces.filter(function(p){return !same(p.at,at);});
      if(tool!=='erase'){var parts=tool.split(':');state.pieces.push({piece:parts[1],side:parts[0],at:at});}
      changed();return;
    }
    if(R.gameStatus(state.pieces,state.turn).state!=='playing'){message('ตำแหน่งนี้จบแล้ว กดย้อนกลับ หรือกลับไปตั้งหมาก');return;}
    if(p&&p.side===state.turn){selected=same(selected,at)?null:at;render();return;}
    if(!selected){message('เลือกหมากฝ่าย'+sideName(state.turn)+'ก่อน แล้วเลือกช่องปลายทาง');return;}
    if(!R.legalDestinations(state.pieces,selected).some(function(to){return same(to,at);})){message('เดินช่องนี้ไม่ได้ ลองเลือกช่องที่มีจุดสีเขียว',true);sound.playResult('failure');return;}
    remember();var from=selected,record=N.formatMove(state.pieces,selected,at),movingPiece=state.pieces.find(function(p){return same(p.at,from);});
    state.pieces=R.applyMove(state.pieces,from,at);state.turn=opponent(state.turn);last={from:from,to:at};selected=null;
    var result=R.gameStatus(state.pieces,state.turn);
    moves.push(record);
    render();sound.queueMove({from:from,to:at,check:result.check,skipAnimation:true});sound.flush();animateMove(from,at);
    if(result.state!=='playing')sound.playResult(result.state==='checkmate'?'complete':'draw');
  });
  $('moveTool').onclick=function(){chooseTool('move');};$('eraseTool').onclick=function(){chooseTool('erase');};
  $('initial').onclick=function(){remember();state=M.initial();changed();$('optionsDialog').close();};
  $('clear').onclick=function(){remember();state={pieces:[],turn:'white'};changed();$('optionsDialog').close();};
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
  $('exportDialog').addEventListener('close',function(){if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null;}if(notationURL){URL.revokeObjectURL(notationURL);notationURL=null;}$('exportPreview').removeAttribute('src');$('exportBoard').focus();});
  $('exportBoard').onclick=async function(){
    var button=$('exportBoard'),position=R.clonePieces(state.pieces),orientation=flipped;
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='กำลังสร้าง…';
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
    finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent='↗ Share';}
  };
  $('undo').onclick=function(){var prev=history.pop();if(!prev)return;future.push(snapshot());restore(prev);};
  $('redo').onclick=function(){var next=future.pop();if(!next)return;history.push(snapshot());restore(next);};
  $('start').onclick=function(){var error=M.validate(state);if(error){message(error,true);sound.playResult('failure');return;}save();trial={state:clone(state),history:history.slice(),future:future.slice()};mode='play';history=[];future=[];moves=[];selected=null;last=null;render();};
  $('restart').onclick=function(){remember();state=clone(trial.state);moves=[];selected=null;last=null;render();$('optionsDialog').close();};
  $('edit').onclick=function(){mode='edit';state=clone(trial.state);history=trial.history;future=trial.future;trial=null;moves=[];selected=null;last=null;render();};
  $('load').onclick=function(){if(mode!=='edit')return;try{var next=M.parse($('fen').value);remember();state=next;changed();$('optionsDialog').close();message('เปิดตำแหน่งแล้ว'+(M.validate(state)?' — '+M.validate(state):''));}catch(e){$('saveNote').textContent=e.message;}};
  $('copy').onclick=async function(){try{await navigator.clipboard.writeText($('fen').value);$('saveNote').textContent='คัดลอกรหัสแล้ว';}catch(e){$('fen').focus();$('fen').select();$('saveNote').textContent='เลือกข้อความแล้ว กรุณาคัดลอกด้วยเมนูของเครื่อง';}};
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('exportDialog').open&&!$('optionsDialog').open){selected=null;tool='move';render();}});
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
      var feedback=document.querySelector('.positionFeedback').offsetHeight,history=document.querySelector('.historyControls').offsetHeight;
      var tools=parseFloat(getComputedStyle(main).getPropertyValue('--tools-reserve'))||184;
      size=Math.min(main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),available-tools-feedback-history-gap-12);
    }else{size=Math.min(boardArea.clientWidth,available-44);}
    main.style.setProperty('--board-size',Math.max(80,Math.floor(size))+'px');
  }
  window.addEventListener('resize',scheduleFit);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',scheduleFit);
  if(window.ResizeObserver){var fitObserver=new ResizeObserver(scheduleFit);['.pageHeader','.actionDock','#editTools','.positionFeedback'].forEach(function(selector){fitObserver.observe(document.querySelector(selector));});}

  render();if(notice)message(notice,notice!=='เปิดตำแหน่งจากลิงก์แชร์แล้ว');
})();
