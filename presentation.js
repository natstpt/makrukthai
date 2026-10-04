/* Gentle original music and move feedback; no external audio files or services. */
(function(root){
  'use strict';
  function create(options){
    var doc=options.document||document,win=options.window||window;
    var musicButton=doc.getElementById('musicBtn'),effectsButton=doc.getElementById('effectsBtn');
    function read(key,fallback){try{var value=win.localStorage.getItem(key);return value===null?fallback:value==='true';}catch(e){return fallback;}}
    function save(key,value){try{win.localStorage.setItem(key,String(value));}catch(e){}}
    var music=read('makrukMusic',false),effects=read('makrukEffects',true),context=null,musicBus,effectBus;
    var timer=null,nextBeat=0,beat=0,unlocked=false,musicNodes=new Set(),pending=null,active=null;
    var AudioContext=win.AudioContext||win.webkitAudioContext;
    var reduced=win.matchMedia&&win.matchMedia('(prefers-reduced-motion: reduce)');
    function sync(){
      if(musicButton){musicButton.textContent='♪';musicButton.setAttribute('aria-pressed',String(music));musicButton.setAttribute('aria-label',music?'ปิดเพลงคลอ':'เปิดเพลงคลอ');musicButton.title=music?'เพลงคลอเปิดอยู่ · แตะเพื่อปิด':'แตะเพื่อเปิดเพลงคลอ';musicButton.disabled=!AudioContext;}
      if(effectsButton){effectsButton.textContent='เสียงเดิน / รุก: '+(effects?'เปิด':'ปิด');effectsButton.setAttribute('aria-pressed',String(effects));effectsButton.disabled=!AudioContext;}
    }
    function tone(bus,freq,start,length,volume,type,isMusic){
      var osc=context.createOscillator(),gain=context.createGain();osc.type=type||'sine';osc.frequency.setValueAtTime(freq,start);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
      osc.connect(gain);gain.connect(bus);if(isMusic)musicNodes.add(osc);
      osc.onended=function(){musicNodes.delete(osc);osc.disconnect();gain.disconnect();};osc.start(start);osc.stop(start+length+.03);
    }
    // 32 beats, 72 BPM: C / Am / F / G, with a sparse melody.
    var melody=[72,null,76,79,null,76,74,null,69,null,72,76,null,72,69,null,65,null,69,72,null,74,72,null,67,null,74,79,null,76,74,null];
    var roots=[48,45,41,43];
    function hz(note){return 440*Math.pow(2,(note-69)/12);}
    function schedule(){
      if(!context||context.state!=='running'||!music||doc.hidden)return;
      if(nextBeat<context.currentTime)nextBeat=context.currentTime+.04;
      while(nextBeat<context.currentTime+.22){
        var i=beat%32;if(melody[i]!==null)tone(musicBus,hz(melody[i]),nextBeat,1.25,.065,'sine',true);
        if(i%8===0){var base=roots[Math.floor(i/8)];[base,base+7,base+12].forEach(function(n){tone(musicBus,hz(n),nextBeat,5.9,.032,'sine',true);});}
        nextBeat+=60/72;beat++;
      }
    }
    function stopMusic(){if(timer!==null){win.clearInterval(timer);timer=null;}musicNodes.forEach(function(n){try{n.stop();}catch(e){}});musicNodes.clear();}
    function startMusic(){if(!context||!unlocked||!music||doc.hidden||timer!==null||context.state!=='running')return;nextBeat=context.currentTime+.04;beat=0;schedule();timer=win.setInterval(schedule,100);}
    function unlock(){
      if(!AudioContext||doc.hidden||!music&&!effects)return;
      try{
        if(!context){context=new AudioContext();musicBus=context.createGain();effectBus=context.createGain();musicBus.gain.value=.24;effectBus.gain.value=effects ? 0.5 : 0;musicBus.connect(context.destination);effectBus.connect(context.destination);}
        unlocked=true;
        if(context.state!=='running')context.resume().then(startMusic).catch(function(){unlocked=false;});else startMusic();
      }catch(e){unlocked=false;}
    }
    function playMove(check){
      if(!effects||!context||!unlocked||context.state!=='running'||doc.hidden)return;
      var now=context.currentTime;
      tone(effectBus,620,now,.075,.09,'triangle',false);
      if(check){tone(effectBus,784,now+.10,.24,.11,'sine',false);tone(effectBus,1046.5,now+.29,.38,.09,'sine',false);}
    }
    function clearMotion(){pending=null;if(active){var old=active;active=null;old.animation.cancel();old.ghost.remove();if(old.target)old.target.style.visibility='';}}
    function queueMove(move){clearMotion();pending=move;playMove(move.check);}
    function flush(){
      if(active){var target=options.board.querySelector('[data-r="'+active.move.to.r+'"][data-c="'+active.move.to.c+'"] .piece');if(target){target.style.visibility='hidden';active.target=target;}return;}
      if(!pending)return;var move=pending;pending=null;
      if(move.skipAnimation||reduced&&reduced.matches)return;
      var target=options.board.querySelector('[data-r="'+move.to.r+'"][data-c="'+move.to.c+'"] .piece');
      if(!target||typeof target.animate!=='function')return;
      var width=options.board.clientWidth/8,height=options.board.clientHeight/8;
      var ghost=target.cloneNode(true);ghost.className='moveGhost';ghost.setAttribute('aria-hidden','true');
      var img=ghost.querySelector('img');if(img&&move.src)img.src=move.src;
      var boardRect=options.board.getBoundingClientRect(),wrapRect=options.wrap.getBoundingClientRect();
      ghost.style.width=width*.88+'px';ghost.style.height=height*.88+'px';
      ghost.style.left=boardRect.left-wrapRect.left+move.to.c*width+width*.06+'px';ghost.style.top=boardRect.top-wrapRect.top+move.to.r*height+height*.06+'px';
      target.style.visibility='hidden';ghost.style.visibility='visible';options.wrap.appendChild(ghost);
      var animation=ghost.animate([{transform:'translate('+((move.from.c-move.to.c)*width)+'px,'+((move.from.r-move.to.r)*height)+'px)'},{transform:'translate(0,0)'}],{duration:210,easing:'cubic-bezier(.22,.65,.3,1)'});
      var item={animation:animation,ghost:ghost,target:target,move:move};active=item;
      animation.onfinish=function(){if(active!==item)return;active=null;ghost.remove();item.target.style.visibility='';};
    }
    if(musicButton)musicButton.addEventListener('click',function(){music=!music;save('makrukMusic',music);sync();if(music)unlock();else stopMusic();});
    if(effectsButton)effectsButton.addEventListener('click',function(){effects=!effects;save('makrukEffects',effects);sync();if(effectBus)effectBus.gain.setTargetAtTime(effects ? 0.5 : 0,context.currentTime,.015);if(effects)unlock();});
    doc.addEventListener('pointerdown',unlock,{passive:true});
    doc.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' ')unlock();});
    doc.addEventListener('visibilitychange',function(){if(doc.hidden){stopMusic();clearMotion();if(context&&context.state==='running')context.suspend().catch(function(){});}else if(unlocked)unlock();});
    if(reduced&&reduced.addEventListener)reduced.addEventListener('change',function(){if(reduced.matches)clearMotion();});
    sync();
    return {queueMove:queueMove,flush:flush,clearMotion:clearMotion,replyDelay:function(){return reduced&&reduced.matches?100:330;}};
  }
  root.MakrukPresentation={create:create};
})(typeof window==='object'?window:globalThis);
